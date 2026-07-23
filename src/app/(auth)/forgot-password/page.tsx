'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Button, Callout, Input } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/update-password`,
    });
    setBusy(false);
    if (error) return setMsg({ tone: 'bad', text: error.message });
    setMsg({
      tone: 'ok',
      text: 'Reset link sent — open it on this device and you can set a new password.',
    });
  }

  return (
    <AuthCard subtitle="Reset your password">
      <form onSubmit={sendReset} className="flex flex-col gap-2">
        <Input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy}>
          Send reset link
        </Button>
      </form>
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
      <p className="text-xs text-ink3 mt-3">
        Remembered it?{' '}
        <Link className="text-accent-dark font-medium" href="/login">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
