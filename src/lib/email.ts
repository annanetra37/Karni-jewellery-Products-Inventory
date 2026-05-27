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
<body style="margin:0;background:#f7f4ee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f1a14;">
  <div style="max-width:560px;margin:32px auto;padding:32px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#9a6e3f,#5b3d1f);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">K</div>
      <strong style="font-size:18px;letter-spacing:-0.01em;">Karni Sales</strong>
    </div>
    <h1 style="font-size:22px;margin:0 0 12px;letter-spacing:-0.01em;">${escapeHtml(title)}</h1>
    <div style="font-size:15px;line-height:1.55;color:#3a2e22;">${body}</div>
    ${cta ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#1f1a14;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">${escapeHtml(cta.label)}</a></p>` : ''}
    <p style="margin-top:32px;font-size:12px;color:#9a8a78;">This is an automated message from Karni Sales.</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
