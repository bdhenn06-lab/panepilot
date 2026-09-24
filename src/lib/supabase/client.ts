import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db/database.types';
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseConfigError,
  supabaseUrl,
} from '@/lib/supabase/config';

export function createClient() {
  if (!isSupabaseConfigured()) throw supabaseConfigError();
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
