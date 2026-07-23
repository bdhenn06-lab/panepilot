'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Button, Callout, Input } from '@/components/ui';

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const supabase = createClient();
    const { error } = await supabase.rpc('create_org', {
      org_name: name.trim(),
      company: name.trim(),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <AuthCard subtitle="Set up your company workspace">
      <p className="text-[13px] text-ink2 mb-3">
        Your company gets its own private territory: parcels, scores, pipeline, and settings. You
        can invite your crew afterwards from Settings.
      </p>
      <form onSubmit={createOrg} className="flex flex-col gap-2">
        <Input
          placeholder="Company name (e.g. Whiteline Window Washing)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
        />
        <Button type="submit" disabled={busy}>
          Create workspace
        </Button>
      </form>
      {err && <Callout tone="bad">{err}</Callout>}
      <p className="text-xs text-ink3 mt-3">
        Joining an existing team? Ask the owner for an invite link instead.
      </p>
    </AuthCard>
  );
}
