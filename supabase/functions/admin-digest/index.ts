// supabase/functions/admin-digest/index.ts
//
// Emails the founder a daily summary, and an alert when Apple Wallet errors
// spike or a scheduled job fails. Sent through Resend with the same
// RESEND_API_KEY secret the welcome email uses.
//
// Callers:
//   - pg_cron, through public.admin_digest_run(mode): sends the header
//     x-digest-secret, checked against the Vault secret by
//     public.admin_digest_secret_ok().
//   - the admin panel ("Send test now" and the status check): a signed-in
//     platform admin.
//
// Modes:
//   daily  - last 24 hours, if the digest is switched on (cron, 05:00 UTC)
//   alert  - last hour; only sends when there is something wrong (cron, hourly)
//   test   - same email as daily, right now (admin panel)
//   status - is email set up? Sends nothing (admin panel)
//
// What to send and to whom is decided in the database
// (public.admin_digest_build); this function only renders and sends.
//
// Deploy without gateway JWT verification; the function checks callers itself:
//   supabase functions deploy admin-digest --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-digest-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ADMIN_URL = 'https://stampfix.app/admin';

interface DigestData {
  period_start: string;
  period_end: string;
  new_merchants: number;
  new_merchant_list: Array<{ business_name: string | null; email: string | null; country: string | null; merchant_code: string | null; created_at: string }>;
  new_customers: number;
  stamps: number;
  rewards: number;
  active_merchants: number;
  wallet_errors: number;
  failed_jobs_count: number;
  failed_jobs: Array<{ jobname: string | null; message: string | null; start_time: string }>;
  open_tickets: number;
  new_contact_messages: number;
  stuck_merchants: number;
  purge_soon: Array<{ merchant_code: string | null; business_name: string | null; purge_after: string }>;
  merchants_total: number;
  pro_paid: number;
  pro_comped: number;
}
interface Plan {
  send: boolean;
  why?: string | null;
  mode: string;
  recipients: string[];
  reasons?: string[];
  data: DigestData;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function shell(title: string, inner: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#37352F">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="background:#fff;border:1px solid #eceae4;border-radius:14px;padding:24px">
      <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#999;font-weight:700">Stampfix admin</p>
      <h1 style="margin:8px 0 18px;font-size:20px">${title}</h1>
      ${inner}
      <p style="margin:22px 0 0"><a href="${ADMIN_URL}" style="display:inline-block;background:#37352F;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">Open the admin panel</a></p>
    </div>
    <p style="text-align:center;font-size:11px;color:#bbb;margin-top:14px">Change who gets this, or switch it off, in Admin → Logs → Email digest.</p>
  </div></body></html>`;
}

function statRow(label: string, value: number | string): string {
  return `<tr><td style="padding:6px 0;color:#666;font-size:14px">${esc(label)}</td><td style="padding:6px 0;text-align:right;font-weight:700;font-size:15px">${esc(value)}</td></tr>`;
}

function attentionItems(d: DigestData): string[] {
  const items: string[] = [];
  if (d.open_tickets > 0) items.push(`${plural(d.open_tickets, 'open support ticket')}`);
  if (d.new_contact_messages > 0) items.push(`${plural(d.new_contact_messages, 'new contact inquiry', 'new contact inquiries')}`);
  if (d.wallet_errors > 0) items.push(`${plural(d.wallet_errors, 'wallet / push error')} in this period`);
  if (d.failed_jobs_count > 0) items.push(`${plural(d.failed_jobs_count, 'scheduled job')} failed`);
  if (d.stuck_merchants > 0) items.push(`${plural(d.stuck_merchants, 'merchant')} signed up 3+ days ago and never gave a stamp`);
  for (const p of d.purge_soon) {
    items.push(`${esc(p.business_name || p.merchant_code || 'A deleted merchant')} will be erased on ${day(p.purge_after)} (undo in Admin → B2B Clients → Recently deleted)`);
  }
  return items;
}

function renderDigest(plan: Plan, isTest: boolean) {
  const d = plan.data;
  const headline: string[] = [];
  if (d.new_merchants) headline.push(plural(d.new_merchants, 'new merchant'));
  headline.push(plural(d.new_customers, 'new customer'));
  headline.push(plural(d.stamps, 'stamp'));
  const subject = `${isTest ? '[Test] ' : ''}Stampfix daily: ${headline.join(', ')}`;

  const attention = attentionItems(d);
  const newMerchants = d.new_merchant_list.length
    ? `<h2 style="font-size:15px;margin:20px 0 6px">New merchants</h2><ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${
        d.new_merchant_list.map((m) => `<li>${esc(m.business_name || '—')} <span style="color:#999">${esc(m.email)}${m.country ? ' · ' + esc(m.country) : ''}</span></li>`).join('')
      }</ul>`
    : '';
  const jobs = d.failed_jobs.length
    ? `<h2 style="font-size:15px;margin:20px 0 6px">Failed jobs</h2><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">${
        d.failed_jobs.map((j) => `<li><b>${esc(j.jobname || 'job')}</b> at ${when(j.start_time)} — ${esc(j.message || '')}</li>`).join('')
      }</ul>`
    : '';

  const inner = `
    <p style="margin:0 0 12px;font-size:13px;color:#888">${when(d.period_start)} → ${when(d.period_end)} (German time)</p>
    <table style="width:100%;border-collapse:collapse">
      ${statRow('New merchants', d.new_merchants)}
      ${statRow('New customers', d.new_customers)}
      ${statRow('Stamps given', d.stamps)}
      ${statRow('Rewards redeemed', d.rewards)}
      ${statRow('Shops that stamped', d.active_merchants)}
    </table>
    <h2 style="font-size:15px;margin:20px 0 6px">Needs you</h2>
    ${attention.length
      ? `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${attention.map((a) => `<li>${a}</li>`).join('')}</ul>`
      : '<p style="margin:0;font-size:14px;color:#2e7d32">Nothing — all clear.</p>'}
    ${newMerchants}
    ${jobs}
    <p style="margin:20px 0 0;font-size:13px;color:#888">${plural(d.merchants_total, 'merchant')} in total · ${d.pro_paid} paying Pro · ${d.pro_comped} comped Pro</p>`;

  const text = [
    subject, '',
    `New merchants: ${d.new_merchants}`, `New customers: ${d.new_customers}`, `Stamps: ${d.stamps}`,
    `Rewards: ${d.rewards}`, `Shops that stamped: ${d.active_merchants}`, '',
    'Needs you:', ...(attention.length ? attention.map((a) => `- ${a.replace(/<[^>]+>/g, '')}`) : ['- Nothing, all clear.']), '',
    ADMIN_URL,
  ].join('\n');
  return { subject, html: shell(isTest ? 'Your daily summary (test)' : 'Your daily summary', inner), text };
}

function renderAlert(plan: Plan) {
  const d = plan.data;
  const reasons = plan.reasons ?? [];
  const parts: string[] = [];
  if (reasons.includes('wallet')) parts.push(`${plural(d.wallet_errors, 'wallet error')} in the last hour`);
  if (reasons.includes('jobs')) parts.push(`${plural(d.failed_jobs_count, 'scheduled job')} failed`);
  const subject = `Stampfix alert: ${parts.join(' and ')}`;
  const jobs = reasons.includes('jobs') && d.failed_jobs.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.6">${
        d.failed_jobs.map((j) => `<li><b>${esc(j.jobname || 'job')}</b> at ${when(j.start_time)} — ${esc(j.message || '')}</li>`).join('')
      }</ul>`
    : '';
  const inner = `
    <p style="margin:0;font-size:15px;line-height:1.6">${parts.map(esc).join('<br>')}</p>
    ${jobs}
    <p style="margin:14px 0 0;font-size:13px;color:#888">Details are in Admin → Logs (Wallet errors / System jobs). You'll get at most one alert of each kind every 6 hours.</p>`;
  const text = [subject, '', ...parts, '', `${ADMIN_URL} (Logs)`].join('\n');
  return { subject, html: shell('Something needs a look', inner), text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const mode = String((body as { mode?: unknown }).mode ?? '');
    if (!['daily', 'alert', 'test', 'status'].includes(mode)) return json({ error: 'Unknown mode' }, 400);

    // Who is calling: the scheduled job (shared secret) or a signed-in admin.
    let caller: 'cron' | 'admin' | null = null;
    const secret = req.headers.get('x-digest-secret')?.trim() ?? '';
    if (secret) {
      const { data } = await db.rpc('admin_digest_secret_ok', { p_secret: secret });
      if (data === true) caller = 'cron';
    }
    if (!caller) {
      const auth = req.headers.get('Authorization') ?? '';
      if (auth.startsWith('Bearer ')) {
        const asUser = createClient(url, anonKey, {
          global: { headers: { Authorization: auth } },
          auth: { persistSession: false },
        });
        const { data: { user } } = await asUser.auth.getUser();
        if (user) {
          const { data: isAdmin } = await asUser.rpc('is_platform_admin');
          if (isAdmin === true) caller = 'admin';
        }
      }
    }
    if (!caller) return json({ error: 'Not authorized' }, 401);
    // The panel can only preview; the real daily / alert runs come from the schedule.
    if (caller === 'admin' && mode !== 'test' && mode !== 'status') return json({ error: 'Forbidden' }, 403);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (mode === 'status') return json({ email_configured: !!resendKey });

    const { data: plan, error } = await db.rpc('admin_digest_build', { p_mode: mode });
    if (error) throw error;
    const p = plan as Plan;
    if (!p?.send) return json({ sent: false, why: p?.why ?? 'Nothing to send.' });

    if (!resendKey) {
      await db.rpc('admin_digest_mark', { p_mode: mode, p_ok: false, p_reasons: p.reasons ?? [], p_error: 'RESEND_API_KEY is not set' });
      return json({ sent: false, why: 'Email is not set up yet: the RESEND_API_KEY secret is missing in Supabase.' });
    }

    const { subject, html, text } = mode === 'alert' ? renderAlert(p) : renderDigest(p, mode === 'test');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Stampfix <hello@stampfix.app>', to: p.recipients, subject, html, text }),
    });
    const errText = r.ok ? null : (await r.text().catch(() => '')).slice(0, 300) || `HTTP ${r.status}`;
    await db.rpc('admin_digest_mark', { p_mode: mode, p_ok: r.ok, p_reasons: p.reasons ?? [], p_error: errText });
    return json(r.ok
      ? { sent: true, recipients: p.recipients.length, subject }
      : { sent: false, why: `The email service refused it: ${errText}` });
  } catch (e) {
    console.error('[admin-digest]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
