// send-welcome-email — sends the Cardholder "Welcome / card ready" email.
// This doubles as the durable-medium confirmation of enrollment and (for EU
// cardholders) the withdrawal-right waiver. Requires the RESEND_API_KEY secret:
//   supabase secrets set RESEND_API_KEY=...
//   supabase functions deploy send-welcome-email
// Called fire-and-forget from the client after a card is created.
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Set to true only for markets where the EU 14-day withdrawal right applies
// (e.g. your Germany launch). For a Canada-only launch, leave false.
const INCLUDE_EU_WAIVER = false;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { email, name, businessName } = await req.json().catch(() => ({}));
    if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400, headers: CORS });

    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) return new Response(JSON.stringify({ ok: false, skipped: 'no RESEND_API_KEY' }), { status: 200, headers: CORS });

    const shop = (businessName || 'the shop').toString();
    const first = (name || 'there').toString();

    const waiver = INCLUDE_EU_WAIVER
      ? `<p style="margin:16px 0 0;font-size:12px;color:#888;line-height:1.6">
           You asked us to start providing your digital loyalty card immediately and acknowledged
           that you lose your 14-day right of withdrawal once it is fully provided. This email is
           your confirmation of that request.
         </p>`
      : '';

    const html = `<!DOCTYPE html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:480px;margin:0 auto;padding:32px 24px">
        <div style="background:#fff;border:1px solid #eceae4;border-radius:16px;padding:28px">
          <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#999;font-weight:700">Stampfix</p>
          <h1 style="margin:10px 0 8px;font-size:22px;color:#37352F">Your ${shop} card is ready 🎉</h1>
          <p style="margin:0;font-size:15px;color:#555;line-height:1.6">
            Hi ${first}, you're enrolled in <strong>${shop}</strong>'s loyalty program. Your card lives
            in your Apple or Google Wallet — just show it to collect stamps and earn rewards.
          </p>
          <p style="margin:16px 0 0;font-size:13px;color:#777;line-height:1.6">
            You can view or delete your data any time from your card's “My Card” page. See Stampfix's
            <a href="https://stampfix.app/terms" style="color:#37352F">Terms</a> and
            <a href="https://stampfix.app/privacy" style="color:#37352F">Privacy Policy</a>.
          </p>
          ${waiver}
        </div>
        <p style="text-align:center;font-size:11px;color:#bbb;margin-top:16px">stampfix.app</p>
      </div>
    </body></html>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Stampfix <hello@stampfix.app>',
        to: [email],
        subject: `Your ${shop} loyalty card is ready`,
        html,
      }),
    });

    return new Response(JSON.stringify({ ok: r.ok }), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200, headers: CORS });
  }
});
