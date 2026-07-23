import { Resend } from 'resend';

/**
 * Thin email layer over Resend. Every send is best-effort: when RESEND_API_KEY
 * isn't configured it no-ops (returns { skipped: true }) so callers never fail
 * just because email isn't wired up yet. Server-only.
 */

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

const FROM = () => process.env.RESEND_FROM || 'PanePilot <onboarding@resend.dev>';

export interface SendResult {
  sent: boolean;
  skipped?: boolean;
  error?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  if (!emailConfigured()) return { sent: false, skipped: true };
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

/** Minimal HTML escape for interpolating user/org values into email HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
