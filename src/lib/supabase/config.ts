/**
 * Single source of truth for whether this deployment has a Supabase project
 * attached. Every entry point (browser client, server client, service-role
 * client, proxy) reads the connection details from here so they all agree, and
 * so an unconfigured checkout is detected before a client is constructed
 * rather than crashing inside the Supabase SDK.
 *
 * The `process.env.NEXT_PUBLIC_*` lookups are written out as static literals
 * because Next.js only inlines that form into the browser bundle — reading them
 * through a computed key would leave them undefined on the client.
 */

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
}

export type EnvProblem = {
  name: string;
  detail: string;
};

/** A copied-but-unedited `.env.example` is the most common way to get here. */
function looksLikePlaceholder(value: string) {
  return /your[-_]?project|example\.supabase|replace[-_]?me|xxxx|<.+>/i.test(value);
}

function isHttpUrl(value: string) {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Describes everything wrong with the Supabase environment; empty when the app
 * is ready to talk to a project. Values are never included in the output — the
 * anon key is publishable, but these messages render in the browser and there
 * is no reason to echo credentials back.
 */
export function supabaseEnvProblems(): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const url = supabaseUrl();
  const key = supabaseAnonKey();

  if (!url) {
    problems.push({ name: 'NEXT_PUBLIC_SUPABASE_URL', detail: 'not set' });
  } else if (looksLikePlaceholder(url)) {
    problems.push({
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      detail: 'still holds a placeholder value',
    });
  } else if (!isHttpUrl(url)) {
    problems.push({
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      detail: 'is not a URL — it should look like https://<project-ref>.supabase.co',
    });
  }

  if (!key) {
    problems.push({ name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', detail: 'not set' });
  } else if (looksLikePlaceholder(key)) {
    problems.push({
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      detail: 'still holds a placeholder value',
    });
  }

  return problems;
}

export function isSupabaseConfigured(): boolean {
  return supabaseEnvProblems().length === 0;
}

/**
 * Thrown by the client factories as a backstop. The proxy and the root layout
 * stop unconfigured requests before they reach a factory, so seeing this in a
 * log means some new entry point skipped `isSupabaseConfigured()`.
 */
export function supabaseConfigError(): Error {
  const detail = supabaseEnvProblems()
    .map((p) => `${p.name} ${p.detail}`)
    .join('; ');
  return new Error(
    `Supabase is not configured (${detail}). Copy .env.example to .env.local and fill in your ` +
      `project URL and anon key from the Supabase dashboard (Project Settings -> API), then ` +
      `restart the dev server.`,
  );
}
