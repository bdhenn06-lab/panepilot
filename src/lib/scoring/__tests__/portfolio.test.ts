import { describe, expect, it } from 'vitest';
import { portfolioChain, type ChainCandidate } from '../portfolio';

const p = (id: number, address: string, ownerName: string | null, annualValue: number): ChainCandidate => ({
  id,
  address,
  ownerName,
  annualValue,
});

/**
 * Closing one building should expose the rest of that landlord's holdings while
 * the operator still has the relationship warm. The grouping reuses the same
 * normalization as the portfolio score, so what it claims here matches what the
 * score claimed earlier.
 */
describe('portfolioChain', () => {
  const territory = [
    p(1, '100 Main St', 'MERIDIAN PROPERTY GROUP LLC', 4000),
    p(2, '200 Oak Ave', 'Meridian Property Group', 3000),
    p(3, '300 Elm Dr', 'MERIDIAN PROPERTY GROUP, INC.', 2500),
    p(4, '400 Pine Rd', 'SOLO OWNER LLC', 9000),
    p(5, '500 Ash Ln', 'MERIDIAN HOLDINGS LLC', 5000),
  ];

  it('finds the rest of the portfolio and totals what is still open', () => {
    const chain = portfolioChain(1, territory)!;
    expect(chain.ownerName).toBe('MERIDIAN PROPERTY GROUP LLC');
    expect(chain.siblings.map((s) => s.id).sort()).toEqual([2, 3]);
    // The won building is excluded — this is the remaining opportunity.
    expect(chain.remainingAnnual).toBe(5500);
  });

  it('does not pull in a different landlord with a similar name', () => {
    // MERIDIAN HOLDINGS is a separate entity from MERIDIAN PROPERTY GROUP.
    expect(portfolioChain(1, territory)!.siblings.map((s) => s.id)).not.toContain(5);
  });

  it('returns null for a single-property owner — there is no chain', () => {
    expect(portfolioChain(4, territory)).toBeNull();
  });

  it('returns null when the owner is unknown', () => {
    const anon = [p(9, '9 Nowhere', null, 1000), p(10, '10 Nowhere', '', 1000)];
    expect(portfolioChain(9, anon)).toBeNull();
  });

  it('ranks the biggest remaining opportunity first', () => {
    const chain = portfolioChain(2, territory)!;
    expect(chain.siblings[0].annualValue).toBe(4000);
  });

  it('returns null for an id that is not in the territory', () => {
    expect(portfolioChain(999, territory)).toBeNull();
  });
});
