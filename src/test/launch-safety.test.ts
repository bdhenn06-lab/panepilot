import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), retrieve: vi.fn(), construct: vi.fn(), user: null as { id: string } | null,
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({
  auth: { getUser: async () => ({ data: { user: mocks.user } }) },
}) }));
vi.mock('@/lib/stripe/server', () => ({ getStripe: () => ({
  webhooks: { constructEvent: mocks.construct }, subscriptions: { retrieve: mocks.retrieve },
}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { proxy } from '@/proxy';
import { POST as webhook } from '@/app/api/stripe/webhook/route';
import { GET as reminders } from '@/app/api/reminders/route';
import { computeCalibration } from '@/lib/scoring/feedback';
import { estimate, outcomeBaseline } from '@/lib/scoring/estimate';
import { DEFAULT_SETTINGS } from '@/lib/scoring/settings';
import { allowedCountyUrl } from '@/lib/counties/safe-url';
import { subscriptionPlan } from '@/lib/stripe/sync';

beforeEach(() => {
  vi.unstubAllEnvs(); vi.clearAllMocks(); mocks.user = null;
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test'); vi.stubEnv('STRIPE_PRICE_CREW', 'price_crew');
  mocks.construct.mockReturnValue({ id: 'evt_1', created: 10, type: 'customer.subscription.updated',
    data: { object: { object: 'subscription', id: 'sub_1' } } });
  mocks.retrieve.mockResolvedValue({ id: 'sub_1', customer: 'cus_1', metadata: { org_id: 'org_1' },
    status: 'active', items: { data: [{ price: { id: 'price_crew' } }] } });
  mocks.rpc.mockResolvedValue({ error: null });
});
function eventRequest() { return new Request('https://example.test/api/stripe/webhook', {
  method: 'POST', headers: { 'stripe-signature': 'test' }, body: '{}',
}); }
describe('service authentication', () => {
  it.each(['/api/stripe/webhook', '/api/reminders'])('allows %s to reach its own authentication', async (path) => {
    const response = await proxy(new NextRequest(`https://example.test${path}`));
    expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull();
  });
  it('still protects pages and other APIs', async () => {
    expect((await proxy(new NextRequest('https://example.test/dashboard'))).status).toBe(307);
    expect((await proxy(new NextRequest('https://example.test/api/counties'))).status).toBe(401);
  });
  it('rejects reminders when the secret is absent', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await reminders(new Request('https://example.test/api/reminders'))).status).toBe(503);
  });
  it('rejects an incorrect cron token', async () => {
    vi.stubEnv('CRON_SECRET', 'expected');
    expect((await reminders(new Request('https://example.test/api/reminders'))).status).toBe(401);
  });
});
describe('billing delivery', () => {
  it('returns a retryable failure when the database rejects the event', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ error: { message: 'database unavailable' } });
    expect((await webhook(eventRequest())).status).toBe(500); log.mockRestore();
  });
  it('derives plan from current Stripe price, not event metadata', async () => {
    expect((await webhook(eventRequest())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('apply_billing_event', expect.objectContaining({new_plan:'crew',customer_id:'cus_1'}));
  });
  it('rejects invalid signatures without a database write', async () => {
    mocks.construct.mockImplementation(() => {throw new Error('invalid')});
    expect((await webhook(eventRequest())).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('delinquent subscriptions do not retain paid entitlement', async () => {
    const sub = await mocks.retrieve(); sub.status='unpaid'; expect(subscriptionPlan(sub)).toBe('trial');
  });
});
describe('calibration baseline', () => {
  it('keeps the correction after repeated accurately priced jobs', () => {
    const parcel = {address:'1 Main',landUse:'Office',bldgSqft:20000,stories:2};
    const base=outcomeBaseline(parcel,DEFAULT_SETTINGS);
    const outcomes=Array.from({length:3},()=>({landUse:'Office',estimatedPrice:base.estimated_price,actualPrice:base.estimated_price*1.2}));
    const corrected=estimate(parcel,DEFAULT_SETTINGS,computeCalibration(outcomes));
    for(let i=0;i<8;i++) outcomes.push({landUse:'Office',estimatedPrice:outcomeBaseline(parcel,DEFAULT_SETTINGS).estimated_price,actualPrice:corrected.pricePerClean});
    expect(computeCalibration(outcomes).priceMultiplier.office).toBeGreaterThan(1.19);
    expect(base.baseline_version).toBe(1);
  });
});
describe('county fetch boundary', () => {
  it.each(['https://127.0.0.1/a/FeatureServer/0','https://evil.test/a/FeatureServer/0',
    'https://services.arcgis.com.evil.test/a','http://services.arcgis.com/a','https://user:pass@services.arcgis.com/a'])('rejects %s',url=>expect(allowedCountyUrl(url)).toBe(false));
  it.each(['https://services2.arcgis.com/a/FeatureServer/0','https://maps.wake.gov/a','https://geo.sandag.org/a'])('allows %s',url=>expect(allowedCountyUrl(url)).toBe(true));
});
