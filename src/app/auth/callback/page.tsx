'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Callout } from '@/components/ui';
import { authDestination } from '@/lib/auth-redirect';

export default function AuthCallbackPage() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const destination = authDestination(url.searchParams.get('next'), fragment.get('type'));
    async function complete() {
      try {
        if (url.searchParams.has('error') || fragment.has('error') ||
          (!url.searchParams.has('code') && !fragment.has('access_token'))) {
          throw new Error('Missing or expired link');
        }
        // Disable automatic exchange so a single-use code is consumed exactly once.
        const auth = createClient(false).auth;
        const code = url.searchParams.get('code');
        const { data, error } = code
          ? await auth.exchangeCodeForSession(code)
          : await auth.setSession({
            access_token: fragment.get('access_token') ?? '',
            refresh_token: fragment.get('refresh_token') ?? '',
          });
        if (error || !data.session) throw error ?? new Error('Session unavailable');
        window.history.replaceState(null, '', '/auth/callback');
        window.location.replace(destination);
      } catch {
        window.history.replaceState(null, '', '/auth/callback');
        setFailed(true);
      }
    }
    void complete();
  }, []);
  return <AuthCard subtitle={failed ? 'This email link could not be verified' : 'Verifying your email link…'}>
    {failed && <>
      <Callout tone="bad">The link may have expired, already been used, or opened in a different browser. Request a fresh link and open it in the same browser where you requested it.</Callout>
      <Link className="text-accent-dark font-medium mt-3 block" href="/forgot-password">Request a new password reset link</Link>
      <Link className="text-ink2 mt-3 block" href="/login">Back to sign in</Link>
    </>}
  </AuthCard>;
}
