import { NextResponse } from 'next/server';
import { DEMO_COOKIE } from '@/lib/sample-territory';

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL('/', request.url));
  res.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
