import { ownerKey } from './owner';

/**
 * Portfolio chain: the rest of a landlord's holdings, surfaced at the moment a
 * deal closes.
 *
 * The portfolio factor already rewards multi-property owners at scoring time,
 * but that is a passive nudge buried in a breakdown. The moment worth acting on
 * is the close — the operator has a warm relationship and a reference job, and
 * that is when "the same owner has four more buildings" changes what they do
 * next. Same normalization as the score, so the two never contradict.
 */

export interface ChainCandidate {
  id: number;
  address: string;
  ownerName?: string | null;
  /** Annual value on the quarterly plan. */
  annualValue: number;
}

export interface PortfolioChain {
  /** Owner as written on the won property, for display. */
  ownerName: string;
  /** Every other property under the same owner, biggest opportunity first. */
  siblings: ChainCandidate[];
  /** Combined annual value of the siblings — excludes the property just won. */
  remainingAnnual: number;
}

/**
 * Other properties held by the owner of `parcelId`, or null when there is no
 * chain to pursue (unknown owner, or the only building they hold).
 */
export function portfolioChain(
  parcelId: number,
  territory: ChainCandidate[],
): PortfolioChain | null {
  const target = territory.find((x) => x.id === parcelId);
  if (!target) return null;

  const key = ownerKey(target.ownerName);
  if (!key) return null;

  const siblings = territory
    .filter((x) => x.id !== parcelId && ownerKey(x.ownerName) === key)
    .sort((a, b) => b.annualValue - a.annualValue);
  if (!siblings.length) return null;

  return {
    ownerName: String(target.ownerName ?? ''),
    siblings,
    remainingAnnual: siblings.reduce((sum, x) => sum + x.annualValue, 0),
  };
}
