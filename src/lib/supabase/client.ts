import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db/database.types';

export function createClient(detectSessionInUrl = true) {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl }, ...(detectSessionInUrl ? {} : { isSingleton: false }) },
  );
}
