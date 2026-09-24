import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db/database.types';
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseConfigError,
  supabaseUrl,
} from '@/lib/supabase/config';

export async function createClient() {
  // `cookies()` is awaited before the config check on purpose: it is what opts
  // the calling page into dynamic rendering. Throwing first would leave pages
  // eligible for prerendering and turn a missing .env.local into a failed
  // `next build` instead of a served setup page.
  const cookieStore = await cookies();
  if (!isSupabaseConfigured()) throw supabaseConfigError();
  return createServerClient<Database>(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — session refresh is handled by the proxy.
          }
        },
      },
    },
  );
}
