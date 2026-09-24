'use client';

/**
 * In-memory workspace for the sample territory. Same scoring engine and the
 * same actions as the live provider — pipeline edits stay in this browser.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobOutcomeRow, ParcelRow } from '@/lib/db/types';
import { parcelToInput } from '@/lib/db/mappers';
import { DEMO_ORG, DEMO_SETTINGS, sampleParcels } from '@/lib/sample-territory';
import {
  EMPTY_STATE,
  advanceTouch,
  buildContext,
  computeCalibration,
  deadFactors,
  estimate,
  jobThesis,
  paneScore,
  renormalizeSettings,
  todayISO,
  withDefaults,
  type Calibration,
  type ProspectState,
  type ScoringSettings,
} from '@/lib/scoring';
import { WorkspaceContext, type ScoredParcel, type WorkspaceValue } from '@/components/workspace';

const STORAGE_KEY = 'pp-demo-v1';

interface Stored {
  states: Record<number, ProspectState>;
  route: number[];
  settings: ScoringSettings;
  outcomes: JobOutcomeRow[];
}

function readStored(): Partial<Stored> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function writeStored(data: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Private mode / quota — demo still works for the session.
  }
}

function seedStates(parcels: ParcelRow[]): Record<number, ProspectState> {
  const t = todayISO();
  const out: Record<number, ProspectState> = {};
  if (parcels[2]) {
    out[parcels[2].id] = {
      ...EMPTY_STATE,
      status: 'Sequencing',
      touch: 1,
      lastTouch: t,
      due: t,
      notes: 'Left a voicemail — try again today.',
    };
  }
  if (parcels[5]) {
    out[parcels[5].id] = {
      ...EMPTY_STATE,
      status: 'Sequencing',
      touch: 2,
      lastTouch: t,
      due: '2099-12-31',
      notes: '',
    };
  }
  if (parcels[8]) {
    out[parcels[8].id] = {
      ...EMPTY_STATE,
      status: 'Meeting',
      touch: 3,
      lastTouch: t,
      due: '',
      notes: 'Walkthrough Thursday 9am.',
    };
  }
  return out;
}

export function DemoWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const parcels = useMemo(() => sampleParcels(), []);
  const [hydrated, setHydrated] = useState(false);
  const [settings, setSettings] = useState<ScoringSettings>(DEMO_SETTINGS);
  const [states, setStates] = useState<Record<number, ProspectState>>(() => seedStates(parcels));
  const [outcomes, setOutcomes] = useState<JobOutcomeRow[]>([]);
  const [route, setRoute] = useState<number[]>([]);

  useEffect(() => {
    // After mount (async) so SSR and the first client paint match.
    void Promise.resolve().then(() => {
      const stored = readStored();
      if (stored.settings) setSettings(withDefaults(stored.settings));
      if (stored.states) setStates(stored.states);
      if (stored.route) setRoute(stored.route);
      if (stored.outcomes) setOutcomes(stored.outcomes);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeStored({ states, route, settings, outcomes });
  }, [hydrated, states, route, settings, outcomes]);

  const calibration: Calibration = useMemo(
    () =>
      computeCalibration(
        outcomes.map((o) => ({
          landUse: o.land_use,
          estimatedPrice: o.estimated_price,
          actualPrice: o.actual_price,
          estimatedHours: o.estimated_hours,
          actualHours: o.actual_hours,
        })),
      ),
    [outcomes],
  );

  const { scored, byId, deadSignals } = useMemo(() => {
    const inputs = parcels.map(parcelToInput);
    const ctx = buildContext(inputs);
    const ests = inputs.map((input) => estimate(input, settings, calibration));
    const dead = deadFactors(inputs.map((input, i) => paneScore(input, ests[i], ctx, settings)));
    const effective = renormalizeSettings(settings, dead);
    const list: ScoredParcel[] = parcels.map((row, i) => ({
      id: row.id,
      row,
      input: inputs[i],
      est: ests[i],
      score: paneScore(inputs[i], ests[i], ctx, effective),
      thesis: jobThesis(inputs[i], ests[i], ctx, effective, calibration),
    }));
    list.sort((a, b) => b.score.total - a.score.total || b.est.annualQuarterly - a.est.annualQuarterly);
    return { scored: list, byId: new Map(list.map((x) => [x.id, x])), deadSignals: dead };
  }, [parcels, settings, calibration]);

  const dueCount = useMemo(() => {
    const t = todayISO();
    return Object.values(states).filter(
      (s) => s.due && s.due <= t && (s.status === '' || s.status === 'Sequencing'),
    ).length;
  }, [states]);

  const stateOf = useCallback(
    (parcelId: number): ProspectState => states[parcelId] ?? EMPTY_STATE,
    [states],
  );

  const setState = useCallback((parcelId: number, patch: Partial<ProspectState>) => {
    setStates((prev) => ({
      ...prev,
      [parcelId]: { ...(prev[parcelId] ?? EMPTY_STATE), ...patch },
    }));
  }, []);

  const markSent = useCallback(
    (parcelId: number): { touch: number; due: string } | null => {
      const next = advanceTouch(states[parcelId] ?? EMPTY_STATE, todayISO());
      if (!next) return null;
      setStates((prev) => ({ ...prev, [parcelId]: next }));
      return { touch: next.touch, due: next.due };
    },
    [states],
  );

  const recordOutcome = useCallback(
    async (parcelId: number, outcome: { actualPrice: number; actualHours: number | null }) => {
      const x = byId.get(parcelId);
      if (!x) return;
      setOutcomes((prev) => [
        ...prev,
        {
          id: `demo-out-${Date.now()}`,
          org_id: DEMO_ORG.id,
          parcel_id: parcelId,
          land_use: x.row.land_use,
          service_mode: settings.serviceMode,
          estimated_price: x.est.pricePerClean,
          actual_price: outcome.actualPrice,
          estimated_hours: x.thesis.crewHoursLow,
          actual_hours: outcome.actualHours,
          closed_at: new Date().toISOString(),
          created_by: 'demo',
        },
      ]);
    },
    [byId, settings.serviceMode],
  );

  const saveSettings = useCallback((s: ScoringSettings) => {
    setSettings(s);
  }, []);

  const toggleRouteStop = useCallback((parcelId: number) => {
    setRoute((prev) =>
      prev.includes(parcelId) ? prev.filter((x) => x !== parcelId) : [...prev, parcelId],
    );
  }, []);

  const addRouteStops = useCallback((parcelIds: number[]) => {
    setRoute((prev) => [...prev, ...parcelIds.filter((id) => !prev.includes(id))]);
  }, []);

  const clearRoute = useCallback(() => {
    setRoute([]);
  }, []);

  const signOut = useCallback(async () => {
    location.href = '/demo/exit';
  }, []);

  const refresh = useCallback(async () => {
    // In-memory — nothing to pull.
  }, []);

  const value: WorkspaceValue = {
    loading: !hydrated,
    loadError: '',
    orgId: DEMO_ORG.id,
    org: DEMO_ORG,
    role: 'owner',
    userEmail: 'demo@panepilot.local',
    userId: 'demo',
    settings,
    parcels,
    scored,
    byId,
    states,
    deadSignals,
    outcomeCount: outcomes.length,
    isDemo: true,
    stateOf,
    route,
    dueCount,
    refresh,
    saveSettings,
    setState,
    markSent,
    recordOutcome,
    toggleRouteStop,
    addRouteStops,
    clearRoute,
    signOut,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
