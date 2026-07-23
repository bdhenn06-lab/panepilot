'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth-card';
import { Button, Callout } from '@/components/ui';

interface Preview {
  org_name: string;
  email: string;
  expired: boolean;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null | 'missing'>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    supabase
      .rpc('invite_preview', { invite_token: token })
      .then(({ data, error }) => {
        if (error || !data?.length) setPreview('missing');
        else setPreview(data[0] as Preview);
      });
  }, [token]);

  async function accept() {
    setBusy(true);
    setErr('');
    const supabase = createClient();
    const { error } = await supabase.rpc('accept_invite', { invite_token: token });
    setBusy(false);
    if (error) return setErr(error.message);
    router.push('/dashboard');
    router.refresh();
  }

  const nextUrl = `/invite/${token}`;

  return (
    <AuthCard subtitle="Team invite">
      {preview === null ? (
        <p className="text-[13px] text-ink2">Checking invite…</p>
      ) : preview === 'missing' ? (
        <Callout tone="bad">This invite link is invalid.</Callout>
      ) : preview.expired ? (
        <Callout tone="bad">This invite has expired or was already used. Ask for a new link.</Callout>
      ) : (
        <>
          <p className="text-[13.5px]">
            You&apos;ve been invited to join <b>{preview.org_name}</b> on PanePilot
            {preview.email ? (
              <span className="text-ink2"> (sent to {preview.email})</span>
            ) : null}
            .
          </p>
          {authed ? (
            <Button onClick={accept} disabled={busy} className="mt-3 w-full">
              Join {preview.org_name}
            </Button>
          ) : (
            <div className="flex gap-2 mt-3">
              <Link
                href={`/signup?next=${encodeURIComponent(nextUrl)}`}
                className="flex-1 h-10 rounded-lg bg-accent text-white text-[13px] font-semibold grid place-items-center hover:bg-accent-dark"
              >
                Create account
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(nextUrl)}`}
                className="flex-1 h-10 rounded-lg border border-line2 text-[13px] text-ink2 grid place-items-center hover:bg-soft"
              >
                Sign in
              </Link>
            </div>
          )}
          {err && <Callout tone="bad">{err}</Callout>}
        </>
      )}
    </AuthCard>
  );
}
