/**
 * The two public Supabase values every client needs. Read via this module so a
 * missing `.env.local` produces one actionable message instead of the SDK's
 * generic "URL and Key are required" stack trace on every route.
 */
export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export const REQUIRED_ENV_VARS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;

// Referenced statically (not via a computed key) so Next.js can inline the
// values into the browser bundle.
function read(): { url?: string; anonKey?: string } {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function missingSupabaseEnv(): string[] {
  const { url, anonKey } = read();
  const missing: string[] = [];
  if (!url) missing.push(REQUIRED_ENV_VARS[0]);
  if (!anonKey) missing.push(REQUIRED_ENV_VARS[1]);
  return missing;
}

export function supabaseEnvHelp(missing: string[] = missingSupabaseEnv()): string {
  return (
    `PanePilot is not configured: missing ${missing.join(' and ')}. ` +
    'Copy .env.example to .env.local, paste the Project URL and anon key from ' +
    'Supabase → Project Settings → API, then restart the dev server. ' +
    'On Vercel, set them under Project → Settings → Environment Variables.'
  );
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const missing = missingSupabaseEnv();
  if (missing.length) throw new Error(supabaseEnvHelp(missing));
  const { url, anonKey } = read();
  return { url: url!, anonKey: anonKey! };
}
