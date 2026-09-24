import { describe, expect, it } from 'vitest';
import { parcelToInput } from '@/lib/db/mappers';
import { DEMO_SETTINGS, sampleParcels } from '@/lib/sample-territory';
import { buildContext, estimate, paneScore } from '@/lib/scoring';
import { authErrorMessage } from '@/lib/auth-errors';

describe('sample territory', () => {
  it('produces a ranked list with real score spread', () => {
    const rows = sampleParcels();
    expect(rows.length).toBe(28);
    const inputs = rows.map(parcelToInput);
    const ctx = buildContext(inputs);
    const scores = inputs.map((input) => {
      const est = estimate(input, DEMO_SETTINGS);
      return paneScore(input, est, ctx, DEMO_SETTINGS).total;
    });
    const unique = new Set(scores);
    expect(unique.size).toBeGreaterThan(5);
    expect(Math.max(...scores)).toBeGreaterThan(Math.min(...scores) + 10);
    expect(rows.every((r) => r.lat && r.lon && r.address)).toBe(true);
    expect(rows.some((r) => (r.owner_key ?? '').length > 0)).toBe(true);
  });
});

describe('authErrorMessage', () => {
  it('rewrites rate-limit and plus-alias rejections', () => {
    expect(authErrorMessage('email rate limit exceeded')).toMatch(/Wait about a minute/);
    expect(
      authErrorMessage("Email address 'a+b@example.com' is invalid"),
    ).toMatch(/regular address/);
    expect(authErrorMessage('Invalid login credentials')).toBe('Invalid login credentials');
  });
});
