import { describe, expect, it } from 'vitest';
import { authDestination } from '@/lib/auth-redirect';

describe('email authentication destinations', () => {
  it('takes legacy recovery links to password entry even without next', () => {
    expect(authDestination(null, 'recovery')).toBe('/update-password');
  });
  it('retains the PKCE reset destination', () => {
    expect(authDestination('/update-password', null)).toBe('/update-password');
  });
  it('preserves signup onboarding', () => {
    expect(authDestination('/onboarding', null)).toBe('/onboarding');
  });
  it.each(['//evil.test', '/\\evil.test', 'https://evil.test', '/unknown'])('rejects untrusted destination %s', (next) => {
    expect(authDestination(next, null)).toBe('/dashboard');
  });
});
