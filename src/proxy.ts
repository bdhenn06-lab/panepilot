import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { missingSupabaseEnv, supabaseEnvHelp } from '@/lib/supabase/env';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/auth', '/invite'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Without Supabase config every route would 500 with the SDK's stack trace.
 * Answer with a plain setup page instead so a fresh clone explains itself.
 */
function notConfiguredResponse(missing: string[]) {
  const message = supabaseEnvHelp(missing);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>PanePilot — setup required</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.5rem;color:#1f2937}
h1{font-size:1.25rem}code,pre{background:#f3f4f6;border-radius:6px;padding:.15em .4em}pre{padding:1em;overflow:auto}</style></head>
<body><h1>PanePilot needs configuration</h1>
<p>${escapeHtml(message)}</p>
<pre>cp .env.example .env.local   # then fill in:
${missing.map((k) => `${k}=...`).join('\n')}</pre>
<p>See the "One-time setup" section of the README.</p></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function proxy(request: NextRequest) {
  const missing = missingSupabaseEnv();
  if (missing.length) {
    console.error(supabaseEnvHelp(missing));
    return notConfiguredResponse(missing);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session token (required for SSR) and gate the app area.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
