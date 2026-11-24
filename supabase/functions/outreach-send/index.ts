// supabase/functions/outreach-send/index.ts
//
// Sends outreach emails through Resend, from hello@stampfix.app.
//
//   { mode: 'tick' }  Sends the next queued email, if one may go out now (sending
//                     switched on, under the daily cap, inside the shop's local
//                     sending window). Called every 10 minutes by pg_cron with the
//                     x-outreach-secret header, or by an admin ("Send next now").
//   { mode: 'test', lead_id, kind }
//                     Admins only: sends the email a shop would get to our own
//                     inbox, marked [Test]. Changes nothing.
//
// Each email: plain text, Reply-To hello@stampfix.app, a one-click unsubscribe
// header, and a tag so Resend's bounce and spam-report events find it again.
//
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Optional: OUTREACH_FROM_EMAIL (default hello@stampfix.app), OUTREACH_TEST_TO (default the same)
// Deploy:  supabase functions deploy outreach-send --no-verify-jwt   (it checks callers itself)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_EMAIL = Deno.env.get('OUTREACH_FROM_EMAIL') ?? 'hello@stampfix.app';
const TEST_TO = Deno.env.get('OUTREACH_TEST_TO') ?? FROM_EMAIL;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-outreach-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const cleanName = (s: string) => s.replace(/["<>\r\n]/g, '').trim().slice(0, 60) || 'Stampfix';

type Sent = { ok: true; id: string } | { ok: false; error: string; retry: boolean };

async function sendViaResend(p: {
  to: string; subject: string; text: string; fromName: string; messageId?: string; unsubToken?: string;
}): Promise<Sent> {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not set', retry: false };
  const headers: Record<string, string> = {};
  if (p.unsubToken) {
    const url = `${SUPABASE_URL}/functions/v1/outreach-unsubscribe?t=${p.unsubToken}`;
    headers['List-Unsubscribe'] = `<${url}>, <mailto:${FROM_EMAIL}?subject=unsubscribe>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // A retry of the same email (e.g. after a timeout) is never sent twice.
      ...(p.messageId ? { 'Idempotency-Key': `outreach-${p.messageId}` } : {}),
    },
    body: JSON.stringify({
      from: `${cleanName(p.fromName)} <${FROM_EMAIL}>`,
      to: [p.to],
      reply_to: FROM_EMAIL,
      subject: p.subject,
      text: p.text,
      headers,
      ...(p.messageId ? { tags: [{ name: 'outreach_message', value: p.messageId }] } : {}),
    }),
  }).catch((e) => e as Error);
  if (res instanceof Error) return { ok: false, error: `network: ${res.message}`, retry: true };
  const body = await res.text();
  if (res.ok) {
    try { return { ok: true, id: String(JSON.parse(body).id ?? '') }; } catch { return { ok: true, id: '' }; }
  }
  // Rate limits and Resend's own trouble are worth another try; anything else is about this email.
  return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}`, retry: res.status === 429 || res.status >= 500 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));

  // Who is asking: the scheduled job (secret header) or a platform admin.
  const secret = req.headers.get('x-outreach-secret')?.trim() ?? '';
  let fromCron = false;
  // deno-lint-ignore no-explicit-any
  let userClient: any = null;
  if (secret) {
    const { data } = await db.rpc('outreach_secret_ok', { p_secret: secret });
    if (data !== true) return json({ error: 'Forbidden' }, 403);
    fromCron = true;
  } else {
    userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated' }, 401);
    const { data: isAdmin } = await userClient.rpc('is_platform_admin');
    if (isAdmin !== true) return json({ error: 'Forbidden' }, 403);
  }

  try {
    if (body.mode === 'test') {
      if (fromCron || !userClient) return json({ error: 'Forbidden' }, 403);
      const { data: pv, error } = await userClient.rpc('admin_outreach_preview', {
        p_id: String(body.lead_id ?? ''), p_kind: body.kind === 'followup' ? 'followup' : 'first',
      });
      if (error || !pv) return json({ error: error?.message ?? 'not_found' }, 400);
      const p = pv as { subject: string; body: string; from_name: string };
      const sent = await sendViaResend({ to: TEST_TO, subject: `[Test] ${p.subject}`, text: p.body, fromName: p.from_name });
      return sent.ok ? json({ ok: true, to: TEST_TO }) : json({ error: sent.error }, 502);
    }

    // mode 'tick': at most one email per call, so emails go out minutes apart.
    const { data: claim, error } = await db.rpc('outreach_claim_next');
    if (error) throw new Error(error.message);
    const c = claim as { status: string; id?: string; to?: string; subject?: string; body?: string; from_name?: string; unsub_token?: string };
    if (c.status !== 'send' || !c.id) return json({ status: c.status });

    const sent = await sendViaResend({
      to: c.to!, subject: c.subject!, text: c.body!, fromName: c.from_name ?? 'Stampfix', messageId: c.id, unsubToken: c.unsub_token,
    });
    if (sent.ok) {
      await db.rpc('outreach_mark_sent', { p_id: c.id, p_resend_id: sent.id });
      return json({ status: 'sent', id: c.id });
    }
    await db.rpc('outreach_mark_failed', { p_id: c.id, p_error: sent.error, p_retry: sent.retry });
    console.warn('[outreach-send] failed', sent.error);
    return json({ status: 'failed', error: sent.error, retry: sent.retry });
  } catch (e) {
    console.error('[outreach-send]', e);
    return json({ error: e instanceof Error ? e.message : 'error' }, 500);
  }
});
