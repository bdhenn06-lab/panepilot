'use client';

/**
 * WorkspaceProvider — the client data layer.
 *
 * Loads the active org's settings, parcels (paged), and pipeline state once,
 * scores everything in memory with the pure engine (the same architecture the
 * prototype validated — scoring needs whole-territory context like ZIP density
 * and median $/sqft), and exposes actions that write back to Supabase with a
 * short debounce.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { outcomeBaseline } from '@/lib/scoring/estimate';
import { parcelToInput, settingsFromRow, settingsToRow } from '@/lib/db/mappers';
import type { Json } from '@/lib/db/database.types';
import type {
  JobOutcomeRow,
  OrgRow,
  OrgSettingsRow,
  ParcelRow,
  ProspectStateRow,
  RouteRow,
} from '@/lib/db/types';
import {
  DEFAULT_SETTINGS,
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
  type Estimate,
  type JobThesis,
  type ParcelInput,
  type ProspectState,
  type ScoreBreakdown,
  type ScoringSettings,
} from '@/lib/scoring';

export interface ScoredParcel {
  id: number;
  row: ParcelRow;
  input: ParcelInput;
  est: Estimate;
  score: ScoreBreakdown;
  /** Money-and-action summary shown in place of the raw score. */
  thesis: JobThesis;
}

interface WorkspaceValue {
  loading: boolean;
  loadError: string;
  orgId: string;
  org: OrgRow | null;
  role: 'owner' | 'admin' | 'member';
  userEmail: string;
  userId: string;
  settings: ScoringSettings;
  parcels: ParcelRow[];
  /** Scored + sorted (best first). */
  scored: ScoredParcel[];
  byId: Map<number, ScoredParcel>;
  states: Record<number, ProspectState>;
  /** Score factors this county's data can't differentiate on. */
  deadSignals: string[];
  /** How many closed jobs are feeding the price/hours calibration. */
  outcomeCount: number;
  stateOf: (parcelId: number) => ProspectState;
  /** Route stops as parcel ids, persisted per org. */
  route: number[];
  dueCount: number;
  refresh: () => Promise<void>;
  saveSettings: (s: ScoringSettings) => void;
  setState: (parcelId: number, patch: Partial<ProspectState>, expectedNotes?: string) => Promise<boolean>;
  markSent: (parcelId: number) => { touch: number; due: string } | null;
  /** Log what a job actually closed for, once won — feeds future estimates. */
  recordOutcome: (
    parcelId: number,
    outcome: { actualPrice: number; actualHours: number | null },
  ) => Promise<void>;
  toggleRouteStop: (parcelId: number) => void;
  addRouteStops: (parcelIds: number[]) => void;
  clearRoute: () => void;
  signOut: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error('useWorkspace outside provider');
  return v;
}

const PAGE = 1000;

export function WorkspaceProvider({
  orgId,
  org,
  role,
  userEmail,
  userId,
  children,
}: {
  orgId: string;
  org: OrgRow;
  role: 'owner' | 'admin' | 'member';
  userEmail: string;
  userId: string;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState<ScoringSettings>(DEFAULT_SETTINGS);
  const [parcels, setParcels] = useState<ParcelRow[]>([]);
  const [states, setStates] = useState<Record<number, ProspectState>>({});
  const [outcomes, setOutcomes] = useState<JobOutcomeRow[]>([]);
  const [route, setRoute] = useState<number[]>([]);
  const routeIdRef = useRef<string | null>(null);
  const stateWrites = useRef<Record<number, Promise<unknown>>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // No synchronous setState before the first await — the mount effect calls
  // this directly; `refresh` (user-triggered) flips the loading flag first.
  const load = useCallback(async () => {
    try {
      const [settingsRes, routeRes] = await Promise.all([
        supabase.from('org_settings').select('*').eq('org_id', orgId).maybeSingle(),
        supabase.from('routes').select('*').eq('org_id', orgId).limit(1).maybeSingle(),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      if (settingsRes.data) {
        setSettings(withDefaults(settingsFromRow(settingsRes.data as OrgSettingsRow)));
      }
      if (routeRes.data) {
        const r = routeRes.data as RouteRow;
        routeIdRef.current = r.id;
        setRoute(r.stops ?? []);
      }

      const all: ParcelRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('parcels')
          .select('*')
          .eq('org_id', orgId)
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...((data ?? []) as ParcelRow[]));
        if (!data || data.length < PAGE) break;
      }
      setParcels(all);

      const st: Record<number, ProspectState> = {};
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('prospect_state')
          .select('*')
          .eq('org_id', orgId)
          .order('parcel_id')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const raw of (data ?? []) as ProspectStateRow[]) {
          st[raw.parcel_id] = {
            status: raw.status,
            touch: raw.touch,
            lastTouch: raw.last_touch ?? '',
            due: raw.due ?? '',
            notes: raw.notes ?? '',
          };
        }
        if (!data || data.length < PAGE) break;
      }
      setStates(st);

      const { data: outcomeRows, error: outcomeErr } = await supabase
        .from('job_outcomes')
        .select('*')
        .eq('org_id', orgId);
      if (outcomeErr) throw outcomeErr;
      setOutcomes((outcomeRows ?? []) as JobOutcomeRow[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, orgId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    await load();
  }, [load]);

  useEffect(() => {
    // Fetch-on-mount: all setState calls inside `load` happen after awaits
    // (async), not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Live team sync: teammates' status/note/sequence changes stream in via
  // Supabase Realtime. Our own writes are skipped (updated_by check) so the
  // debounced local edits aren't clobbered mid-typing.
  useEffect(() => {
    const channel = supabase
      .channel(`pstate-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prospect_state', filter: `org_id=eq.${orgId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<ProspectStateRow>;
            if (old.parcel_id != null) {
              setStates((prev) => {
                const next = { ...prev };
                delete next[old.parcel_id!];
                return next;
              });
            }
            return;
          }
          const row = payload.new as ProspectStateRow;
          if (!row || row.updated_by === userId) return;
          setStates((prev) => ({
            ...prev,
            [row.parcel_id]: {
              status: row.status,
              touch: row.touch,
              lastTouch: row.last_touch ?? '',
              due: row.due ?? '',
              notes: row.notes ?? '',
            },
          }));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, orgId, userId]);

  // What closed jobs say about this org's actual prices and hours, by
  // building type. Empty until enough jobs are logged for any use class —
  // see MIN_OUTCOMES_FOR_CALIBRATION — so a fresh org scores exactly as
  // before.
  const calibration: Calibration = useMemo(
    () =>
      computeCalibration(
        outcomes.filter((o) => o.baseline_version === 1 && o.service_mode === settings.serviceMode).map((o) => ({
          landUse: o.land_use,
          estimatedPrice: o.estimated_price,
          actualPrice: o.actual_price,
          estimatedHours: o.estimated_hours,
          actualHours: o.actual_hours,
        })),
      ),
    [outcomes, settings.serviceMode],
  );

  // ---------- scoring (memoized over parcels + settings) ----------
  const { scored, byId, deadSignals } = useMemo(() => {
    const inputs = parcels.map(parcelToInput);
    const ctx = buildContext(inputs);
    const ests = inputs.map((input) => estimate(input, settings, calibration));

    // First pass finds the factors this county's data can't differentiate on;
    // the weights then move onto the ones that can, so a sparse territory
    // doesn't collapse into a single grade band. Order is unaffected either
    // way — a constant factor adds the same points to every parcel.
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
    return Object.entries(states).filter(
      ([, s]) => s.due && s.due <= t && (s.status === '' || s.status === 'Sequencing'),
    ).length;
  }, [states]);

  // ---------- persistence helpers (debounced like the prototype) ----------
  const debounce = useCallback((key: string, ms: number, fn: () => void) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  }, []);

  const pushState = useCallback(
    (parcelId: number, patch: Partial<ProspectState>, expectedNotes?: string): Promise<boolean> => {
      const fields: Record<string, Json> = {};
      if (patch.status !== undefined) fields.status = patch.status;
      if (patch.touch !== undefined) fields.touch = patch.touch;
      if (patch.lastTouch !== undefined) fields.last_touch = patch.lastTouch || null;
      if (patch.due !== undefined) fields.due = patch.due || null;
      if (patch.notes !== undefined) fields.notes = patch.notes;
      const write = (stateWrites.current[parcelId] ?? Promise.resolve()).then(async () => {
        const { error } = await supabase.rpc('patch_prospect', {
          target_org: orgId, target_parcel: parcelId, patch: fields, expected_notes: expectedNotes,
        });
        if (error) {
          setLoadError(`Sync error: ${error.message}`);
          await load();
          return false;
        }
        return true;
      }).catch((error) => {
        setLoadError(`Sync error: ${String(error)}`);
        return false;
      });
      stateWrites.current[parcelId] = write;
      return write;
    },
    [supabase, orgId, load],
  );

  const stateOf = useCallback(
    (parcelId: number): ProspectState => states[parcelId] ?? EMPTY_STATE,
    [states],
  );

  const setState = useCallback(
    (parcelId: number, patch: Partial<ProspectState>, expectedNotes?: string) => {
      const originalNotes = expectedNotes ?? states[parcelId]?.notes ?? '';
      setStates((prev) => ({ ...prev, [parcelId]: { ...(prev[parcelId] ?? EMPTY_STATE), ...patch } }));
      return pushState(parcelId, patch, originalNotes);
    },
    [pushState, states],
  );

  const markSent = useCallback(
    (parcelId: number): { touch: number; due: string } | null => {
      const current = states[parcelId] ?? EMPTY_STATE;
      const next = advanceTouch(current, todayISO());
      if (!next) return null;
      setStates((prev) => ({ ...prev, [parcelId]: next }));
      void pushState(parcelId, { status: next.status, touch: next.touch, lastTouch: next.lastTouch, due: next.due });
      return { touch: next.touch, due: next.due };
    },
    [states, pushState],
  );

  const recordOutcome = useCallback(
    async (parcelId: number, outcome: { actualPrice: number; actualHours: number | null }) => {
      const x = byId.get(parcelId);
      if (!x) return;
      const { error } = await supabase.from('job_outcomes').insert({
        org_id: orgId,
        parcel_id: parcelId,
        land_use: x.row.land_use,
        service_mode: settings.serviceMode,
        ...outcomeBaseline(x.input, settings),
        actual_price: outcome.actualPrice,
        actual_hours: outcome.actualHours,
        created_by: userId,
      });
      if (error) {
        setLoadError(`Sync error: ${error.message}`);
        throw new Error(error.message);
      }
      // Refetch rather than append locally — the calibration math is meant to
      // run over the server's copy, and outcomes are rare writes.
      const { data } = await supabase.from('job_outcomes').select('*').eq('org_id', orgId);
      setOutcomes((data ?? []) as JobOutcomeRow[]);
    },
    [supabase, orgId, userId, settings, byId],
  );

  const saveSettings = useCallback(
    (s: ScoringSettings) => {
      setSettings(s);
      debounce('settings', 500, () => {
        void supabase
          .from('org_settings')
          .upsert({ org_id: orgId, ...settingsToRow(s), updated_at: new Date().toISOString() })
          .then(({ error }) => {
            if (error) setLoadError(`Sync error: ${error.message}`);
          });
      });
    },
    [supabase, orgId, debounce],
  );

  const persistRoute = useCallback(
    (stops: number[]) => {
      debounce('route', 400, () => {
        void (async () => {
          if (routeIdRef.current) {
            const { error } = await supabase
              .from('routes')
              .update({ stops, updated_at: new Date().toISOString() })
              .eq('id', routeIdRef.current);
            if (error) setLoadError(`Sync error: ${error.message}`);
          } else {
            const { data, error } = await supabase
              .from('routes')
              .insert({ org_id: orgId, stops, created_by: userId })
              .select('id')
              .single();
            if (error) setLoadError(`Sync error: ${error.message}`);
            else routeIdRef.current = data.id;
          }
        })();
      });
    },
    [supabase, orgId, userId, debounce],
  );

  const toggleRouteStop = useCallback(
    (parcelId: number) => {
      setRoute((prev) => {
        const next = prev.includes(parcelId)
          ? prev.filter((x) => x !== parcelId)
          : [...prev, parcelId];
        persistRoute(next);
        return next;
      });
    },
    [persistRoute],
  );

  const addRouteStops = useCallback(
    (parcelIds: number[]) => {
      setRoute((prev) => {
        const next = [...prev, ...parcelIds.filter((id) => !prev.includes(id))];
        persistRoute(next);
        return next;
      });
    },
    [persistRoute],
  );

  const clearRoute = useCallback(() => {
    setRoute([]);
    persistRoute([]);
  }, [persistRoute]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    location.href = '/login';
  }, [supabase]);

  const value: WorkspaceValue = {
    loading,
    loadError,
    orgId,
    org,
    role,
    userEmail,
    userId,
    settings,
    parcels,
    scored,
    byId,
    states,
    deadSignals,
    outcomeCount: outcomes.length,
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
