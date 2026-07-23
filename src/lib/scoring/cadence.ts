import { addDays } from './format';

/**
 * The 5-touch outreach cadence. `dayGap` is the gap from the previous touch;
 * cumulative send days are 1, 3, 6, 10, 14.
 */
export const TOUCHES = [
  { dayGap: 0, name: 'Territory hook' },
  { dayGap: 2, name: 'Proof building' },
  { dayGap: 3, name: 'Peer story' },
  { dayGap: 4, name: 'Objection killer' },
  { dayGap: 4, name: 'Breakup' },
] as const;

export const MAX_TOUCHES = TOUCHES.length;

/** Statuses a prospect can be in. '' means untouched. */
export const STATUSES = ['', 'Sequencing', 'Meeting', 'Proposal', 'Won', 'Dead'] as const;
export type ProspectStatus = (typeof STATUSES)[number];

/** Statuses that keep a prospect in the active follow-up queue. */
export const QUEUE_STATUSES: ProspectStatus[] = ['', 'Sequencing'];

export interface ProspectState {
  status: ProspectStatus;
  touch: number;
  lastTouch: string;
  due: string;
  notes: string;
}

export const EMPTY_STATE: ProspectState = {
  status: '',
  touch: 0,
  lastTouch: '',
  due: '',
  notes: '',
};

/**
 * Advance the sequence one touch. Returns the new state, or null when the
 * sequence is already complete. Pure — caller persists.
 */
export function advanceTouch(state: ProspectState, todayISO: string): ProspectState | null {
  const t = state.touch || 0;
  if (t >= MAX_TOUCHES) return null;
  const next = t + 1;
  return {
    ...state,
    touch: next,
    lastTouch: todayISO,
    status: state.status && state.status !== 'Sequencing' ? state.status : 'Sequencing',
    due: next < MAX_TOUCHES ? addDays(todayISO, TOUCHES[next].dayGap) : '',
  };
}

/** Is this prospect due for a follow-up on or before `todayISO`? */
export function isDue(state: ProspectState | undefined, todayISO: string): boolean {
  return (
    !!state &&
    !!state.due &&
    state.due <= todayISO &&
    QUEUE_STATUSES.includes(state.status)
  );
}
