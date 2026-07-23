import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAID_PLANS, planForPriceId, priceIdForPlan, stripeConfigured } from '../plans';

const ENV_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_SOLO', 'STRIPE_PRICE_CREW', 'STRIPE_PRICE_FRANCHISE'];

describe('stripe plan mapping', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    ENV_KEYS.forEach((k) => (saved[k] = process.env[k]));
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_SOLO = 'price_solo';
    process.env.STRIPE_PRICE_CREW = 'price_crew';
    process.env.STRIPE_PRICE_FRANCHISE = 'price_franchise';
  });
  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it('exposes the three paid plans at the spec prices', () => {
    expect(PAID_PLANS.map((p) => [p.id, p.priceMonthly])).toEqual([
      ['solo', 79],
      ['crew', 199],
      ['franchise', 499],
    ]);
  });

  it('maps plan id -> configured price id', () => {
    expect(priceIdForPlan('solo')).toBe('price_solo');
    expect(priceIdForPlan('crew')).toBe('price_crew');
    expect(priceIdForPlan('franchise')).toBe('price_franchise');
    expect(priceIdForPlan('trial')).toBe(''); // no price for trial
  });

  it('maps price id -> plan id (webhook direction)', () => {
    expect(planForPriceId('price_solo')).toBe('solo');
    expect(planForPriceId('price_crew')).toBe('crew');
    expect(planForPriceId('price_franchise')).toBe('franchise');
    expect(planForPriceId('price_unknown')).toBeNull();
  });

  it('stripeConfigured reflects the secret key', () => {
    expect(stripeConfigured()).toBe(true);
    delete process.env.STRIPE_SECRET_KEY;
    expect(stripeConfigured()).toBe(false);
  });
});
