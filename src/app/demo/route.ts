import { NextResponse } from 'next/server';
import { DEMO_COOKIE } from '@/lib/sample-territory';

/** Enter the in-browser sample territory — no account required. */
export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL('/dashboard', request.url));
  res.cookies.set(DEMO_COOKIE, '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    sameSite: 'lax',
  });
  return res;
}
