import { escapeHtml } from './resend';

const ACCENT = '#2a78d6';

function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111113">${bodyHtml}<p style="color:#8a8983;font-size:12px;margin-top:28px">PanePilot — customer acquisition for window cleaning</p></div>`;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Invitation to join an org, with the accept link. */
export function inviteEmail(opts: {
  orgName: string;
  inviteUrl: string;
  inviterEmail?: string;
}): EmailContent {
  const org = escapeHtml(opts.orgName);
  const who = opts.inviterEmail ? escapeHtml(opts.inviterEmail) : 'A teammate';
  return {
    subject: `You're invited to ${opts.orgName} on PanePilot`,
    html: shell(
      `<h2 style="font-size:18px">Join ${org} on PanePilot</h2>` +
        `<p>${who} invited you to their PanePilot workspace — the scored territory, pipeline, and follow-ups are shared across the team.</p>` +
        `<p style="margin:24px 0"><a href="${opts.inviteUrl}" style="background:${ACCENT};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">Accept invite</a></p>` +
        `<p style="color:#54534f;font-size:13px">Or paste this link: ${escapeHtml(opts.inviteUrl)}</p>` +
        `<p style="color:#8a8983;font-size:12px">This invite expires in 14 days.</p>`,
    ),
    text: `${who} invited you to join ${opts.orgName} on PanePilot.\n\nAccept: ${opts.inviteUrl}\n\nThis invite expires in 14 days.`,
  };
}

export interface DueItem {
  address: string;
  owner: string;
  touch: number;
}

/** Daily digest of follow-ups due for an org. */
export function reminderEmail(opts: { orgName: string; due: DueItem[]; appUrl: string }): EmailContent {
  const rows = opts.due
    .slice(0, 25)
    .map(
      (d) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(d.address)}<br><span style="color:#8a8983;font-size:12px">${escapeHtml(d.owner)} · touch ${d.touch}/5</span></td></tr>`,
    )
    .join('');
  const n = opts.due.length;
  return {
    subject: `${n} follow-up${n === 1 ? '' : 's'} due today — ${opts.orgName}`,
    html: shell(
      `<h2 style="font-size:18px">${n} follow-up${n === 1 ? '' : 's'} due today</h2>` +
        `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>` +
        `<p style="margin:24px 0"><a href="${opts.appUrl}/follow-ups" style="background:${ACCENT};color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;display:inline-block">Work the queue</a></p>`,
    ),
    text:
      `${n} follow-ups due today for ${opts.orgName}:\n\n` +
      opts.due
        .slice(0, 25)
        .map((d) => `- ${d.address} (${d.owner}, touch ${d.touch}/5)`)
        .join('\n') +
      `\n\nWork the queue: ${opts.appUrl}/follow-ups`,
  };
}
