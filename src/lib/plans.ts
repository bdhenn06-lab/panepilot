/**
 * Plan definitions — the single source of truth for seat limits, shared by the
 * UI (Settings seat counter, billing page) and mirrored in SQL
 * (create_invite / accept_invite enforce the same numbers server-side).
 */
export type PlanId = 'trial' | 'solo' | 'crew' | 'franchise';

/** Max total seats (members + pending invites) per plan. */
export const SEAT_LIMITS: Record<PlanId, number> = {
  trial: 2,
  solo: 1,
  crew: 5,
  franchise: 999999, // effectively unlimited
};

export function seatLimit(plan: PlanId): number {
  return SEAT_LIMITS[plan] ?? SEAT_LIMITS.trial;
}

/** Are more seats available given current usage (members + pending invites)? */
export function seatsAvailable(plan: PlanId, used: number): boolean {
  return used < seatLimit(plan);
}

/** Human label for the seat allowance, e.g. "5 seats" or "Unlimited". */
export function seatLimitLabel(plan: PlanId): string {
  const n = seatLimit(plan);
  return n >= 999999 ? 'Unlimited seats' : `${n} seat${n === 1 ? '' : 's'}`;
}
