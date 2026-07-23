/**
 * Normalize an owner name so LLC/holding variations of the same landlord
 * collapse to one key: "MERIDIAN PROPERTY GROUP LLC" and
 * "Meridian Property Group" -> "meridian".
 */
export function ownerKey(owner: unknown): string {
  return String(owner ?? '')
    .toLowerCase()
    .replace(
      /\b(llc|ltd|inc|co|corp|company|properties|property|holdings|group|lp|llp|trust|trustee|the)\b/g,
      '',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Best-effort salutation from an owner-of-record string.
 * Falls back to "there" when the first token looks like an entity.
 */
export function firstName(owner: unknown): string {
  const words = String(owner ?? '')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/);
  return words.length && words[0] && !/llc|inc|ltd|corp|trust/i.test(words[0])
    ? words[0]
    : 'there';
}
