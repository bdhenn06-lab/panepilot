import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emailConfigured, sendEmail } from '@/lib/email/resend';
import { reminderEmail, type DueItem } from '@/lib/email/templates';
import { todayISO } from '@/lib/scoring';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Daily follow-up digest. Meant to be hit by Vercel Cron (see vercel.json) —
 * secured by CRON_SECRET, which Vercel sends as a bearer token. For each org
 * with follow-ups due today, emails every owner/admin the list. No-ops
 * silently if email isn't configured.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }
  if (!emailConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'email not configured' });
  }

  const admin = createAdminClient();
  const today = todayISO();
  const origin = new URL(request.url).origin;

  // Due = untouched/sequencing prospects whose due date has passed.
  const { data: dueRows, error } = await admin
    .from('prospect_state')
    .select('org_id, touch, status, due, parcels(address, owner_name)')
    .lte('due', today)
    .in('status', ['', 'Sequencing'])
    .not('due', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group due items by org.
  const byOrg = new Map<string, DueItem[]>();
  for (const r of dueRows ?? []) {
    const parcel = Array.isArray(r.parcels) ? r.parcels[0] : r.parcels;
    const list = byOrg.get(r.org_id) ?? [];
    list.push({
      address: parcel?.address ?? '(unknown)',
      owner: parcel?.owner_name ?? '',
      touch: r.touch ?? 0,
    });
    byOrg.set(r.org_id, list);
  }

  let orgsNotified = 0;
  let emailsSent = 0;
  for (const [orgId, due] of byOrg) {
    if (!due.length) continue;
    const { data: org } = await admin.from('orgs').select('name').eq('id', orgId).maybeSingle();
    const { data: members } = await admin
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
      .in('role', ['owner', 'admin']);
    const content = reminderEmail({ orgName: org?.name ?? 'your team', due, appUrl: origin });

    for (const m of members ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(m.user_id);
      const to = u.user?.email;
      if (!to) continue;
      const r = await sendEmail({ to, subject: content.subject, html: content.html, text: content.text });
      if (r.sent) emailsSent++;
    }
    orgsNotified++;
  }

  return NextResponse.json({ ok: true, orgsNotified, emailsSent });
}
