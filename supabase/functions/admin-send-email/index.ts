// supabase/functions/admin-send-email/index.ts
//
// Admin > Email shops: sends one email to a shop owner through Resend, from
// hello@stampfix.app. Platform admins only. The recipient is looked up from
// the shop's account in admin_email_start(), never taken from the request.
// Every email is logged; the same subject to the same shop within 10 minutes
// is refused, and the request's key makes Resend drop an accidental repeat.
//
//   POST { merchant_id, template, lang: 'en'|'de', subject, body, key }
//
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY
// Optional: SHOP_EMAIL_FROM (default "Abhishek from Stampfix <hello@stampfix.app>")
// Deploy:  supabase functions deploy admin-send-email

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { withShopFooter, unfilledFields, type EmailLang } from './footer.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const FROM = Deno.env.get('SHOP_EMAIL_FROM') ?? 'Abhishek from Stampfix <hello@stampfix.app>';
const REPLY_TO = 'hello@stampfix.app';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY not set' }, 500);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const b = await req.json().catch(() => ({}));
  const merchantId = String(b.merchant_id ?? '');
  const lang: EmailLang = b.lang === 'de' ? 'de' : 'en';
  const subject = String(b.subject ?? '').replace(/[\r\n]+/g, ' ').trim();
  const body = String(b.body ?? '').trim();
  const key = String(b.key ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(merchantId) || !/^[0-9a-zA-Z-]{8,64}$/.test(key)) return json({ error: 'bad_request' }, 400);
  if (!subject || subject.length > 200 || !body || body.length > 9000) return json({ error: 'empty_or_too_long' }, 400);
  const missing = unfilledFields(subject + '\n' + body);
  if (missing.length) return json({ error: `unfilled:${missing.join(',')}` }, 400);

  const full = withShopFooter(body, lang);
  const { data: start, error: startErr } = await userClient.rpc('admin_email_start', {
    p_merchant: merchantId, p_template: String(b.template ?? '').slice(0, 40), p_subject: subject, p_body: full,
  });
  if (startErr) {
    const m = startErr.message;
    return json({ error: /Not authorised/.test(m) ? 'Forbidden' : m }, /Not authorised/.test(m) ? 403 : 400);
  }
  const { id, to } = start as { id: string; to: string };

  let resendId = '';
  let error: string | null = null;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `shop-email-${key}` },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text: full }),
    });
    const text = await res.text();
    if (res.ok) { try { resendId = String(JSON.parse(text).id ?? ''); } catch { /* sent anyway */ } }
    else error = `Resend ${res.status}: ${text.slice(0, 300)}`;
  } catch (e) {
    error = `network: ${e instanceof Error ? e.message : 'error'}`;
  }
  await userClient.rpc('admin_email_finish', { p_id: id, p_resend_id: resendId, p_error: error });
  return error ? json({ error }, 502) : json({ ok: true, id, to });
});
