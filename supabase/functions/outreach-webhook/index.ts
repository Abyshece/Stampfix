// supabase/functions/outreach-webhook/index.ts
//
// Resend's webhook for outreach emails. Bounces and spam reports block the
// address for good; too many bounces, or any spam report, pause sending
// (see outreach_webhook_event()). Events for the app's own emails don't match
// an outreach email and are ignored.
//
// Set up in Resend: Webhooks -> Add endpoint
//   URL:    https://<project>.supabase.co/functions/v1/outreach-webhook
//   Events: email.bounced, email.complained
// then save its signing secret as the RESEND_WEBHOOK_SECRET function secret.
//
// Secrets: RESEND_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy:  supabase functions deploy outreach-webhook --no-verify-jwt   (Resend sends no JWT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { verifySvix } from './svix.ts';

const SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  if (!SECRET) {
    console.error('[outreach-webhook] RESEND_WEBHOOK_SECRET not set');
    return new Response('not configured', { status: 500 });
  }
  const raw = await req.text();
  const ok = await verifySvix(SECRET, req.headers.get('svix-id'), req.headers.get('svix-timestamp'),
    req.headers.get('svix-signature'), raw);
  if (!ok) return new Response('bad signature', { status: 401 });

  let event: { type?: string; data?: { email_id?: string } };
  try { event = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const type = String(event.type ?? '');
  if (type !== 'email.bounced' && type !== 'email.complained') return new Response('ignored');

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('outreach_webhook_event', { p_type: type, p_resend_id: String(event.data?.email_id ?? '') });
  if (error) {
    console.error('[outreach-webhook]', error.message);
    // Resend tries again later.
    return new Response('error', { status: 500 });
  }
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
});
