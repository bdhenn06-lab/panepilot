// Referenced as literal `process.env.NEXT_PUBLIC_*` so Next inlines them into the browser bundle.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const MISSING_SUPABASE_ENV_MESSAGE =
  'Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
  '(copy .env.example to .env.local locally, or add them in Vercel → Settings → Environment Variables), ' +
  'then restart the server.';

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

export function supabaseEnv() {
  if (!url || !anonKey) throw new Error(MISSING_SUPABASE_ENV_MESSAGE);
  return { url, anonKey };
}
