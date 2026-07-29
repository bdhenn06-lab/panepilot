import { describe, expect, it } from 'vitest';
import { firstName, ownerKey } from '../owner';

/**
 * Owner grouping drives the portfolio factor and the "one call opens all of
 * them" claim in outreach. Over-merging is the dangerous direction: telling an
 * operator that two unrelated landlords are one account sends them into a call
 * with a false premise. Under-merging only costs a missed opportunity.
 */
describe('ownerKey', () => {
  it('collapses legal-form suffixes so one landlord is one key', () => {
    const a = ownerKey('MERIDIAN PROPERTY GROUP LLC');
    expect(a).toBe(ownerKey('Meridian Property Group'));
    expect(a).toBe(ownerKey('MERIDIAN PROPERTY GROUP, INC.'));
    expect(a).toBe(ownerKey('The Meridian Property Group Co'));
  });

  it('keeps genuinely different entities apart', () => {
    // These used to collapse to "smith": the descriptive word carries the
    // distinction, and stripping it invented a portfolio that does not exist.
    const keys = [
      ownerKey('SMITH PROPERTIES LLC'),
      ownerKey('SMITH HOLDINGS LLC'),
      ownerKey('SMITH FAMILY TRUST'),
      ownerKey('SMITH GROUP LLC'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not merge every generically-named entity in a county', () => {
    expect(ownerKey('CINCINNATI PROPERTY GROUP')).not.toBe(ownerKey('CINCINNATI TRUST'));
    expect(ownerKey('RIVERSIDE HOLDINGS')).not.toBe(ownerKey('RIVERSIDE PROPERTIES'));
  });

  it('still tolerates punctuation, spacing and plural drift', () => {
    expect(ownerKey('  ACME   PROPERTIES,  L.L.C. ')).toBe(ownerKey('Acme Properties LLC'));
    // Singular/plural of the same descriptor is the same landlord.
    expect(ownerKey('ACME PROPERTY LLC')).toBe(ownerKey('ACME PROPERTIES LLC'));
  });

  it('returns empty for names that are nothing but legal boilerplate', () => {
    // Callers skip empty keys, which stops every such parcel grouping together.
    expect(ownerKey('LLC')).toBe('');
    expect(ownerKey('The Co.')).toBe('');
    expect(ownerKey(null)).toBe('');
    expect(ownerKey(undefined)).toBe('');
  });
});

describe('firstName', () => {
  it('uses a personal first name when the owner is a person', () => {
    expect(firstName('Brian Henning')).toBe('Brian');
  });

  it('falls back to a neutral greeting for entities', () => {
    expect(firstName('ACME PROPERTIES LLC')).toBe('there');
    expect(firstName('')).toBe('there');
  });
});
