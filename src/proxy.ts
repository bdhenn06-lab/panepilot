import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseEnvProblems,
  supabaseUrl,
} from '@/lib/supabase/config';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/auth', '/invite'];
const SETUP_PATH = '/setup';

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // With no project attached there is no session to read, and every page in the
  // app reads one — so serve the setup instructions in place of whichever page
  // was asked for, and answer API callers with a status that says "not
  // configured" rather than letting the Supabase SDK throw a 500.
  if (!isSupabaseConfigured()) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          error: 'Supabase is not configured on this deployment.',
          missing: supabaseEnvProblems(),
        },
        { status: 503 },
      );
    }
    if (pathname === SETUP_PATH) return NextResponse.next({ request });
    return NextResponse.rewrite(new URL(SETUP_PATH, request.url));
  }

  // Configured: the setup page has nothing left to say.
  if (pathname === SETUP_PATH) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
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

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
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
