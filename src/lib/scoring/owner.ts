/**
 * Owner-name normalization for portfolio grouping.
 *
 * Only legal-form boilerplate is stripped — "LLC", "Inc", "The". Descriptive
 * words like "Properties", "Holdings", "Group" and "Trust" are kept, because
 * they are what distinguishes one landlord from another: stripping them
 * collapsed SMITH PROPERTIES, SMITH HOLDINGS and SMITH FAMILY TRUST into a
 * single fake portfolio, and merged every generically-named entity in a county.
 *
 * Over-merging is the dangerous direction. The portfolio factor and the "one
 * call opens all of them" outreach line both assert a real relationship, so a
 * missed grouping only costs an opportunity while a false one sends the
 * operator into a call on a false premise.
 */

/** Pure legal-form tokens — the same landlord written different ways. */
const LEGAL_FORMS = /\b(llc|ltd|inc|co|corp|company|lp|llp|the)\b/g;

export function ownerKey(owner: unknown): string {
  return (
    String(owner ?? '')
      .toLowerCase()
      // Punctuation first, so "L.L.C." becomes strippable rather than "l l c".
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\bl l c\b/g, 'llc')
      .replace(/\bl l p\b/g, 'llp')
      // Singular/plural and trust/trustee are the same entity written two ways.
      .replace(/\bproperties\b/g, 'property')
      .replace(/\btrustee\b/g, 'trust')
      .replace(LEGAL_FORMS, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Markers that say this owner-of-record is an entity, not a person. */
const ENTITY_MARKERS =
  /\b(llc|inc|ltd|corp|company|co|properties|property|holdings|group|trust|trustee|lp|llp|associates|partners|partnership|enterprises|investments|realty|management)\b/i;

/**
 * Best-effort salutation from an owner-of-record string.
 * Falls back to "there" whenever the name looks like an entity — checking the
 * whole string, since "ACME PROPERTIES LLC" leads with a word that is not a
 * legal form but is plainly not a first name either.
 */
export function firstName(owner: unknown): string {
  const raw = String(owner ?? '').trim();
  if (!raw || ENTITY_MARKERS.test(raw)) return 'there';
  const words = raw.replace(/,/g, ' ').trim().split(/\s+/);
  return words[0] || 'there';
}
