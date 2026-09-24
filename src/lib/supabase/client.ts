import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db/database.types';
import { supabaseEnv } from './env';

export function createClient() {
  const { url, anonKey } = supabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
