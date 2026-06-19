// supabase/functions/apple-wallet-webservice/index.ts
//
// Apple PassKit Web Service. Apple Wallet calls these endpoints on the
// device's behalf to register for updates, poll for changes, and download
// the refreshed pass. The pass's `webServiceURL` points here, and every
// request carries `Authorization: ApplePass <token>` which we validate
// against the per-card token stored by generate-apple-pass.
//
// Apple appends "/v1/..." to webServiceURL, so the paths we handle are:
//   POST   /v1/devices/{deviceLibraryId}/registrations/{passTypeId}/{serial}
//   DELETE /v1/devices/{deviceLibraryId}/registrations/{passTypeId}/{serial}
//   GET    /v1/devices/{deviceLibraryId}/registrations/{passTypeId}?passesUpdatedSince=<tag>
//   GET    /v1/passes/{passTypeId}/{serial}
//   POST   /v1/log
//
// Deploy WITHOUT JWT verification (Apple calls it with its own ApplePass
// token, not a Supabase JWT):
//   supabase functions deploy apple-wallet-webservice --no-verify-jwt

import { createClient } from 'jsr:@supabase/supabase-js@2';

function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required secret: ${name}`);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function appleToken(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^ApplePass\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

Deno.serve(async (req) => {
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const passTypeId = env('APPLE_PASS_TYPE_ID', 'pass.app.stampfix.loyalty');

  // Everything after ".../apple-wallet-webservice" — i.e. the "/v1/..." part.
  const fullPath = new URL(req.url).pathname;
  const marker = '/apple-wallet-webservice';
  const sub = fullPath.includes(marker) ? fullPath.slice(fullPath.indexOf(marker) + marker.length) : fullPath;
  const seg = sub.split('/').filter(Boolean); // e.g. ['v1','devices',deviceId,'registrations',passType,serial]
  const url = new URL(req.url);

  // Validate the ApplePass token against the card's stored token.
  const validate = async (serial: string): Promise<boolean> => {
    const token = appleToken(req);
    if (!token) return false;
    const { data } = await supabase.from('cards').select('apple_auth_token').eq('id', serial).maybeSingle();
    return !!data && data.apple_auth_token === token;
  };

  try {
    // POST /v1/log — Apple posts diagnostic logs here.
    if (req.method === 'POST' && seg[0] === 'v1' && seg[1] === 'log') {
      const body = await req.json().catch(() => ({}));
      console.log('[apple-wallet-webservice] device log:', JSON.stringify(body));
      return new Response('ok', { status: 200 });
    }

    // ---- Device registration endpoints: /v1/devices/{device}/registrations/{passType}/{serial}
    if (seg[0] === 'v1' && seg[1] === 'devices' && seg[3] === 'registrations') {
      const deviceId = seg[2];
      const serial = seg[5]; // undefined for the list endpoint (no serial)

      // POST — register this device for the pass.
      if (req.method === 'POST' && serial) {
        if (!(await validate(serial))) return new Response('Unauthorized', { status: 401 });
        const body = await req.json().catch(() => ({}));
        const pushToken = body.pushToken;
        if (!pushToken) return new Response('pushToken required', { status: 400 });

        const { data: existing } = await supabase
          .from('apple_wallet_registrations')
          .select('device_library_identifier')
          .eq('device_library_identifier', deviceId)
          .eq('serial_number', serial)
          .maybeSingle();

        await supabase.from('apple_wallet_registrations').upsert({
          device_library_identifier: deviceId,
          pass_type_identifier: passTypeId,
          serial_number: serial,
          push_token: pushToken,
        });
        return new Response(null, { status: existing ? 200 : 201 });
      }

      // DELETE — unregister this device for the pass.
      if (req.method === 'DELETE' && serial) {
        if (!(await validate(serial))) return new Response('Unauthorized', { status: 401 });
        await supabase
          .from('apple_wallet_registrations')
          .delete()
          .eq('device_library_identifier', deviceId)
          .eq('serial_number', serial);
        return new Response('ok', { status: 200 });
      }

      // GET (no serial) — list serials updated since the given tag.
      if (req.method === 'GET' && !serial) {
        const since = url.searchParams.get('passesUpdatedSince');
        const { data: regs } = await supabase
          .from('apple_wallet_registrations')
          .select('serial_number')
          .eq('device_library_identifier', deviceId);
        if (!regs || regs.length === 0) return new Response(null, { status: 204 });

        const serials = regs.map((r) => r.serial_number);
        const { data: cards } = await supabase
          .from('cards')
          .select('id, passkit_last_updated')
          .in('id', serials);
        if (!cards || cards.length === 0) return new Response(null, { status: 204 });

        const sinceDate = since ? new Date(since) : null;
        const changed = sinceDate
          ? cards.filter((c) => new Date(c.passkit_last_updated) > sinceDate)
          : cards;
        if (changed.length === 0) return new Response(null, { status: 204 });

        const lastUpdated = changed
          .map((c) => c.passkit_last_updated)
          .reduce((a, b) => (new Date(b) > new Date(a) ? b : a));
        return json({ lastUpdated, serialNumbers: changed.map((c) => c.id) });
      }
    }

    // ---- Get the latest pass: GET /v1/passes/{passType}/{serial}
    if (req.method === 'GET' && seg[0] === 'v1' && seg[1] === 'passes') {
      const serial = seg[3];
      if (!serial) return new Response('Not found', { status: 404 });
      if (!(await validate(serial))) return new Response('Unauthorized', { status: 401 });

      const { data: card } = await supabase
        .from('cards')
        .select('passkit_last_updated')
        .eq('id', serial)
        .maybeSingle();
      if (!card) return new Response('Not found', { status: 404 });

      const lastModified = new Date(card.passkit_last_updated);
      const ims = req.headers.get('if-modified-since');
      if (ims && new Date(ims).getTime() >= Math.floor(lastModified.getTime() / 1000) * 1000) {
        return new Response(null, { status: 304 });
      }

      // Reuse generate-apple-pass to build the .pkpass (no code duplication).
      const passResp = await fetch(`${env('SUPABASE_URL')}/functions/v1/generate-apple-pass?cardId=${encodeURIComponent(serial)}`);
      if (!passResp.ok) {
        console.error('[apple-wallet-webservice] generate-apple-pass failed:', passResp.status);
        return new Response('Pass build failed', { status: 500 });
      }
      const bytes = new Uint8Array(await passResp.arrayBuffer());
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Last-Modified': lastModified.toUTCString(),
        },
      });
    }

    return new Response('Not found', { status: 404 });
  } catch (e) {
    console.error('[apple-wallet-webservice]', e);
    return new Response('Internal error', { status: 500 });
  }
});
