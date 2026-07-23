import type { BuildingUseClass } from './types';

/** Parse a number out of county-CSV noise: "$1,234,500" -> 1234500. */
export function parseNum(v: unknown): number {
  return parseFloat(String(v ?? '').replace(/[$,]/g, '')) || 0;
}

/**
 * Is this land-use value commercial/industrial?
 * Numeric codes: county land-use codes 300-499 (industrial 3xx, commercial 4xx).
 * Text values: keyword match.
 */
export function isCommercial(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  const n = parseInt(s, 10);
  if (!isNaN(n) && /^\d+$/.test(s.slice(0, 3))) return n >= 300 && n <= 499;
  return /comm|office|retail|indus|store|shop|hotel|motel|warehouse|bank|restaur|medical|clinic|mixed/i.test(
    s,
  );
}

/**
 * Is this land-use value a small residential property (single family, condo/
 * townhome, duplex-fourplex)? Excludes vacant land and larger apartment
 * buildings (20+ units), which are sold more like commercial properties.
 * Numeric codes: Ohio DTE residential range 500-599.
 */
export function isResidential(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  if (/vacant|apartment/i.test(s)) return false;
  const n = parseInt(s, 10);
  if (!isNaN(n) && /^\d+$/.test(s.slice(0, 3))) return n >= 500 && n <= 599;
  return /single.?family|duplex|triplex|fourplex|condo|townh?ouse|manufactured|mobile.?home|\bresidential\b/i.test(
    s,
  );
}

/**
 * Classify a land-use string into a building type with a fit multiplier.
 * Office/medical/hotel are ideal commercial window-cleaning targets;
 * warehouses are not. Single-family homes are the ideal residential target;
 * condos/townhomes and small multi-family are close behind.
 */
export function classifyUse(v: unknown): BuildingUseClass {
  const s = String(v ?? '').toLowerCase();
  if (/office|bank|financ|professional/.test(s)) return { kind: 'office', multiplier: 1 };
  if (/medical|clinic|hospital|dental/.test(s)) return { kind: 'medical', multiplier: 1 };
  if (/hotel|motel|lodg/.test(s)) return { kind: 'hotel', multiplier: 1 };
  if (/retail|store|shop|restaur|supermark|mall/.test(s)) return { kind: 'retail', multiplier: 0.9 };
  if (/duplex|triplex|fourplex/.test(s)) return { kind: 'small_multifamily', multiplier: 0.9 };
  if (/condo|townh?ouse/.test(s)) return { kind: 'condo_townhome', multiplier: 0.85 };
  if (/single.?family|manufactured|mobile.?home/.test(s)) return { kind: 'single_family', multiplier: 1 };
  if (/mixed|apart/.test(s)) return { kind: 'mixed', multiplier: 0.75 };
  if (/warehouse|indus|storage|manuf/.test(s)) return { kind: 'industrial', multiplier: 0.35 };
  const n = parseInt(s, 10);
  if (!isNaN(n)) {
    if (n >= 500 && n <= 599) return { kind: 'single_family', multiplier: 1 };
    if (n >= 400 && n <= 499) return { kind: 'commercial', multiplier: 0.9 };
    if (n >= 300 && n <= 399) return { kind: 'industrial', multiplier: 0.35 };
  }
  return { kind: 'commercial', multiplier: 0.8 };
}
