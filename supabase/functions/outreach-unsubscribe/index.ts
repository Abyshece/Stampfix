// supabase/functions/outreach-unsubscribe/index.ts
//
// The address in every outreach email's List-Unsubscribe header.
//   POST ?t=<token>  One-click unsubscribe (Gmail, Outlook, Apple Mail): done at once.
//   GET  ?t=<token>  Sends the browser to stampfix.app/stop-emails?t=<token>, which
//                    unsubscribes and says so.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional PUBLIC_APP_ORIGIN
// Deploy:  supabase functions deploy outreach-unsubscribe --no-verify-jwt   (mail apps send no JWT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_ORIGIN = Deno.env.get('PUBLIC_APP_ORIGIN') ?? 'https://stampfix.app';
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (req.method === 'GET') {
    const to = `${APP_ORIGIN}/stop-emails${TOKEN.test(token) ? `?t=${token}` : ''}`;
    return new Response(null, { status: 302, headers: { Location: to } });
  }
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  if (!TOKEN.test(token)) return new Response('unknown link', { status: 400 });
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await db.rpc('outreach_unsubscribe', { p_token: token });
  if (error) {
    console.error('[outreach-unsubscribe]', error.message);
    return new Response('error', { status: 500 });
  }
  return new Response('You are unsubscribed.');
});
