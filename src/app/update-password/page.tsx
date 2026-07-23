'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Button, Callout, Input } from '@/components/ui';

/**
 * Landing page for password-recovery links (the emailed link signs the user
 * in via /auth/callback, then forwards here). Standalone authed route — no
 * org/workspace required, so recovery works even before onboarding.
 */
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password !== confirm) return setMsg({ tone: 'bad', text: 'Passwords do not match.' });
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ tone: 'bad', text: error.message });
    setMsg({ tone: 'ok', text: 'Password updated — taking you to your workspace…' });
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthCard subtitle="Set a new password">
      <form onSubmit={save} className="flex flex-col gap-2">
        <Input
          type="password"
          placeholder="New password (8+ characters)"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Repeat new password"
          autoComplete="new-password"
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy}>
          Update password
        </Button>
      </form>
      {msg && <Callout tone={msg.tone}>{msg.text}</Callout>}
    </AuthCard>
  );
}
