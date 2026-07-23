'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Button, Callout, Input } from '@/components/ui';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
    });
    setBusy(false);
    if (error) return setMsg({ tone: 'bad', text: error.message });
    if (data.session) {
      router.push('/onboarding');
      router.refresh();
    } else {
      setMsg({
        tone: 'ok',
        text: 'Account created — check your email to confirm, then sign in.',
      });
    }
  }

  return (
    <AuthCard subtitle="Create your account">
      <form onSubmit={signUp} className="flex flex-col gap-2">
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
          placeholder="Password (8+ characters)"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy} className="mt-1">
          Create account
        </Button>
      </form>
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
      <p className="text-xs text-ink3 mt-3">
        Already have an account?{' '}
        <Link className="text-accent-dark font-medium" href="/login">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
