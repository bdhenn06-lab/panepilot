import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/database.types';

/**
 * Service-role Supabase client — bypasses RLS. ONLY for trusted server code
 * that has already verified authenticity by other means (e.g. a Stripe webhook
 * signature). Never import this into client components or unauthenticated
 * routes. Throws if the service-role key isn't configured.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing.');
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
