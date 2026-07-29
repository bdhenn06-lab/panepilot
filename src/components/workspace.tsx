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
import { parcelToInput, settingsFromRow, settingsToRow } from '@/lib/db/mappers';
import type { OrgRow, OrgSettingsRow, ParcelRow, ProspectStateRow, RouteRow } from '@/lib/db/types';
import {
  DEFAULT_SETTINGS,
  EMPTY_STATE,
  advanceTouch,
  buildContext,
  deadFactors,
  estimate,
  jobThesis,
  paneScore,
  renormalizeSettings,
  todayISO,
  withDefaults,
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
  stateOf: (parcelId: number) => ProspectState;
  /** Route stops as parcel ids, persisted per org. */
  route: number[];
  dueCount: number;
  refresh: () => Promise<void>;
  saveSettings: (s: ScoringSettings) => void;
  setState: (parcelId: number, patch: Partial<ProspectState>) => void;
  markSent: (parcelId: number) => { touch: number; due: string } | null;
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
  const [route, setRoute] = useState<number[]>([]);
  const routeIdRef = useRef<string | null>(null);
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

  // ---------- scoring (memoized over parcels + settings) ----------
  const { scored, byId, deadSignals } = useMemo(() => {
    const inputs = parcels.map(parcelToInput);
    const ctx = buildContext(inputs);
    const ests = inputs.map((input) => estimate(input, settings));

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
      thesis: jobThesis(inputs[i], ests[i], ctx, effective),
    }));
    list.sort((a, b) => b.score.total - a.score.total || b.est.annualQuarterly - a.est.annualQuarterly);
    return { scored: list, byId: new Map(list.map((x) => [x.id, x])), deadSignals: dead };
  }, [parcels, settings]);

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
    (parcelId: number, s: ProspectState) => {
      debounce(`st-${parcelId}`, 400, () => {
        void supabase
          .from('prospect_state')
          .upsert({
            parcel_id: parcelId,
            org_id: orgId,
            status: s.status,
            touch: s.touch,
            last_touch: s.lastTouch || null,
            due: s.due || null,
            notes: s.notes,
            updated_by: userId,
            updated_at: new Date().toISOString(),
          })
          .then(({ error }) => {
            if (error) setLoadError(`Sync error: ${error.message}`);
          });
      });
    },
    [supabase, orgId, userId, debounce],
  );

  const stateOf = useCallback(
    (parcelId: number): ProspectState => states[parcelId] ?? EMPTY_STATE,
    [states],
  );

  const setState = useCallback(
    (parcelId: number, patch: Partial<ProspectState>) => {
      setStates((prev) => {
        const next = { ...(prev[parcelId] ?? EMPTY_STATE), ...patch };
        pushState(parcelId, next);
        return { ...prev, [parcelId]: next };
      });
    },
    [pushState],
  );

  const markSent = useCallback(
    (parcelId: number): { touch: number; due: string } | null => {
      const current = states[parcelId] ?? EMPTY_STATE;
      const next = advanceTouch(current, todayISO());
      if (!next) return null;
      setStates((prev) => ({ ...prev, [parcelId]: next }));
      pushState(parcelId, next);
      return { touch: next.touch, due: next.due };
    },
    [states, pushState],
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
    stateOf,
    route,
    dueCount,
    refresh,
    saveSettings,
    setState,
    markSent,
    toggleRouteStop,
    addRouteStops,
    clearRoute,
    signOut,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
