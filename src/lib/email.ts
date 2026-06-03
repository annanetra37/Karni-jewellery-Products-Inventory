import { Resend } from 'resend';

let client: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

const FROM = process.env.EMAIL_FROM || 'Karni Sales <onboarding@resend.dev>';

export async function sendEmail(args: { to: string | string[]; subject: string; html: string; text?: string }) {
  const r = getResend();
  if (!r) {
    console.warn(`[email] RESEND_API_KEY not set — skipping send to ${args.to}`);
    return;
  }
  try {
    const res = await r.emails.send({
      from: FROM,
      to: Array.isArray(args.to) ? args.to : [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (res.error) console.error('[email] send failed', res.error);
  } catch (e) {
    console.error('[email] exception', e);
  }
}

export function wrap(title: string, body: string, cta?: { href: string; label: string }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f5eedf;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a2620;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:18px;box-shadow:0 4px 24px rgba(26,47,40,0.08);overflow:hidden;">
    <div style="background:#2d4a3d;padding:24px 32px;display:flex;align-items:center;gap:12px;">
      <div style="width:40px;height:40px;border-radius:12px;background:#2d4a3d;border:1.5px solid #ec9c95;color:#ec9c95;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:18px;">K</div>
      <strong style="font-size:18px;letter-spacing:-0.01em;color:#f4ecd9;font-family:'Playfair Display',Georgia,serif;font-weight:600;">Karni Sales</strong>
    </div>
    <div style="padding:32px;">
      <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;margin:0 0 12px;letter-spacing:-0.015em;color:#1f3d32;font-weight:600;">${escapeHtml(title)}</h1>
      <div style="font-size:15px;line-height:1.6;color:#3a4a3f;">${body}</div>
      ${cta ? `<p style="margin:28px 0 0;"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#2d4a3d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:600;letter-spacing:-0.005em;">${escapeHtml(cta.label)}</a></p>` : ''}
      <p style="margin-top:32px;font-size:12px;color:#9ca39d;border-top:1px solid #e5d9bf;padding-top:16px;">This is an automated message from Karni Sales.</p>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
