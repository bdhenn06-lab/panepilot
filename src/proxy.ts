import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  isSupabaseConfigured,
  MISSING_SUPABASE_ENV_MESSAGE,
  supabaseEnv,
} from '@/lib/supabase/env';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/auth', '/invite'];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function setupRequired() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>PanePilot setup required</title></head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>PanePilot needs Supabase credentials</h1>
<p>${MISSING_SUPABASE_ENV_MESSAGE}</p>
<p>See “One-time setup” in the README.</p>
</body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) return setupRequired();
  const { url, anonKey } = supabaseEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    url,
    anonKey,
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
