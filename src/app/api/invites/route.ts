import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend';
import { inviteEmail } from '@/lib/email/templates';
import type { OrgInviteRow } from '@/lib/db/types';

export const runtime = 'nodejs';

/**
 * Creates an org invite (seat-enforced by the create_invite RPC) and, when
 * email is configured, sends the invite link to the recipient. The shareable
 * link is always returned so invites work even without an email service.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let orgId: string;
  let email: string;
  try {
    const body = await request.json();
    orgId = body.orgId;
    email = body.email;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!email?.trim()) return NextResponse.json({ error: 'Email required.' }, { status: 400 });

  // create_invite enforces admin + seat limits server-side.
  const { data, error } = await supabase
    .rpc('create_invite', { target_org: orgId, invite_email: email.trim() })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const invite = data as OrgInviteRow;
  const { data: org } = await supabase.from('orgs').select('name').eq('id', orgId).maybeSingle();
  const origin = new URL(request.url).origin;
  const inviteUrl = `${origin}/invite/${invite.token}`;

  const content = inviteEmail({
    orgName: org?.name ?? 'your team',
    inviteUrl,
    inviterEmail: user.email ?? undefined,
  });
  const emailResult = await sendEmail({
    to: invite.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });

  return NextResponse.json({ invite, inviteUrl, emailSent: emailResult.sent });
}
