'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Button, Callout, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setMsg({ tone: 'bad', text: error.message });
    router.push(next);
    router.refresh();
  }

  async function magicLink() {
    if (!email.trim()) return setMsg({ tone: 'bad', text: 'Enter your email first.' });
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) return setMsg({ tone: 'bad', text: error.message });
    setMsg({ tone: 'ok', text: 'Magic link sent — check your inbox and open it on this device.' });
  }

  return (
    <AuthCard subtitle="Team sign-in">
      <form onSubmit={signIn} className="flex flex-col gap-2">
        <Input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex gap-2 mt-1">
          <Button type="submit" disabled={busy} className="flex-1">
            Sign in
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={magicLink}
            className="flex-1 !bg-panel !text-ink2 border border-line2 hover:!bg-soft"
          >
            Email magic link
          </Button>
        </div>
      </form>
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
      <p className="text-xs text-ink3 mt-3">
        No account?{' '}
        <Link className="text-accent-dark font-medium" href="/signup">
          Create one
        </Link>
        {' · '}
        <Link className="text-accent-dark font-medium" href="/forgot-password">
          Forgot password?
        </Link>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
