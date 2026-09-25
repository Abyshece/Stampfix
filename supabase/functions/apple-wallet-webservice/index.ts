// supabase/functions/apple-wallet-webservice/index.ts
//
// Apple PassKit Web Service. Apple Wallet calls these endpoints on the
// device's behalf to register for updates, poll for changes, and download
// the refreshed pass. The pass's `webServiceURL` points here, and every
// request carries `Authorization: ApplePass <token>` which we validate
// against the per-card token stored by generate-apple-pass.
//
// Apple appends "/v1/..." to webServiceURL, so the routes are:
//   POST   /v1/devices/{deviceLibraryId}/registrations/{passTypeId}/{serial}
//   DELETE /v1/devices/{deviceLibraryId}/registrations/{passTypeId}/{serial}
//   GET    /v1/devices/{deviceLibraryId}/registrations/{passTypeId}?passesUpdatedSince=<tag>
//   GET    /v1/passes/{passTypeId}/{serial}
//   POST   /v1/log
//
// Routing locates the PassKit segments BY NAME (devices / registrations /
// passes / log) so it works regardless of how Supabase presents the path
// prefix. The fallback returns the raw path for debugging.
//
// Deploy WITHOUT JWT verification (Apple uses its own ApplePass token):
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

// Read a query param from the RAW query string. URLSearchParams applies form
// decoding, which turns a literal '+' into a space. iOS sends the update tag
// back without escaping '+', so the old ISO tags ("...+00:00") arrived as
// "... 00:00", parsed as Invalid Date, and every push-triggered update check
// answered 204 "nothing changed". decodeURIComponent leaves '+' alone.
function rawQueryParam(url: URL, name: string): string | null {
  for (const pair of url.search.replace(/^\?/, '').split('&')) {
    const eq = pair.indexOf('=');
    if ((eq < 0 ? pair : pair.slice(0, eq)) !== name) continue;
    const value = eq < 0 ? '' : pair.slice(eq + 1);
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return null;
}

// Update tag -> epoch ms. Tags we issue are plain epoch-ms digits (like
// Apple's own example), so there is nothing for a URL to mangle. Passes
// already on devices still hold an old ISO tag; accept those too, restoring a
// '+' that arrived as a space. Returns null when the tag is unreadable.
function tagToMs(tag: string | null): number | null {
  const t = (tag ?? '').trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n < 1e11 ? n * 1000 : n; // tolerate a seconds tag too
  }
  const ms = Date.parse(t.replace(/ /g, '+'));
  return Number.isNaN(ms) ? null : ms;
}

Deno.serve(async (req) => {
  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const passTypeId = env('APPLE_PASS_TYPE_ID', 'pass.app.stampfix.loyalty');

  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const lower = parts.map((p) => p.toLowerCase());

  // Validate the ApplePass token against the card's stored token.
  const validate = async (serial: string): Promise<boolean> => {
    const token = appleToken(req);
    if (!token) return false;
    const { data } = await supabase.from('cards').select('apple_auth_token').eq('id', serial).maybeSingle();
    return !!data && data.apple_auth_token === token;
  };

  try {
    // ---- POST /v1/log — Apple posts diagnostic logs here.
    if (req.method === 'POST' && lower.includes('log') && !lower.includes('devices') && !lower.includes('passes')) {
      const body = await req.json().catch(() => ({}));
      console.log('[apple-wallet-webservice] device log:', JSON.stringify(body));
      return new Response('ok', { status: 200 });
    }

    // ---- /v1/devices/{device}/registrations/{passType}/{serial}
    const devIdx = lower.indexOf('devices');
    if (devIdx >= 0 && lower[devIdx + 2] === 'registrations') {
      const deviceId = parts[devIdx + 1];
      const serial = parts[devIdx + 4]; // undefined for the list endpoint (no serial)

      // POST — register this device for the pass.
      if (req.method === 'POST' && serial) {
        if (!(await validate(serial))) return new Response('Unauthorized', { status: 401 });
        const body = await req.json().catch(() => ({}));
        const pushToken = body.pushToken;
        if (!pushToken) return new Response('pushToken required', { status: 400 });

        // Store the push token. Update-then-insert rather than upsert, so it
        // works whatever the table's key is, and CHECK the result: answering
        // 201 after a failed write tells iOS it's registered, so it never
        // retries, and that card never gets another update push.
        const { data: updatedRows, error: updErr } = await supabase
          .from('apple_wallet_registrations')
          .update({ push_token: pushToken, pass_type_identifier: passTypeId })
          .eq('device_library_identifier', deviceId)
          .eq('serial_number', serial)
          .select('device_library_identifier');
        if (updErr) {
          console.error('[apple-wallet-webservice] registration update failed:', updErr);
          return new Response('Registration failed', { status: 500 });
        }
        const existing = (updatedRows?.length ?? 0) > 0;
        if (!existing) {
          const { error: insErr } = await supabase.from('apple_wallet_registrations').insert({
            device_library_identifier: deviceId,
            pass_type_identifier: passTypeId,
            serial_number: serial,
            push_token: pushToken,
          });
          // 23505 = a concurrent registration of the same pass won the race.
          if (insErr && insErr.code !== '23505') {
            console.error('[apple-wallet-webservice] registration insert failed:', insErr);
            return new Response('Registration failed', { status: 500 });
          }
        }
        console.log('[apple-wallet-webservice] registered device for pass:', JSON.stringify({ serial, existing }));

        // Immediately sync the pass to current state. Covers brand-new cards
        // that were stamped *before* the device finished registering — that
        // stamp's own push had no device to reach, so we replay it here now
        // that a device exists. Awaited so it runs before the function exits.
        try {
          await fetch(`${env('SUPABASE_URL')}/functions/v1/push-apple-update`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ cardId: serial }),
          });
        } catch (e) {
          console.error('[apple-wallet-webservice] post-register push failed:', e);
        }

        return new Response(null, { status: existing ? 200 : 201 });
      }

      // DELETE — unregister this device for the pass.
      // Do NOT require a matching token here. A device removing its OWN
      // registration (device + serial from the URL) is self-authorising, and
      // requiring the token means a pass with a stale/orphaned token can never
      // be unregistered: iOS retries forever and that failure poisons every
      // other pass on the device. Matching device+serial lets orphans clear.
      if (req.method === 'DELETE' && serial) {
        await supabase
          .from('apple_wallet_registrations')
          .delete()
          .eq('device_library_identifier', deviceId)
          .eq('serial_number', serial);
        return new Response('ok', { status: 200 });
      }

      // GET (no serial) — list serials updated since the given tag. This is
      // the FIRST call Wallet makes after an update push (pull-to-refresh
      // skips it and fetches the pass directly), so a wrong 204 here silently
      // kills every automatic update and its lock-screen notification.
      if (req.method === 'GET' && !serial) {
        const since = rawQueryParam(url, 'passesUpdatedSince');
        const sinceMs = tagToMs(since);
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

        // No tag, or one we can't read: list every pass on the device rather
        // than claim nothing changed. Wallet then fetches each one with
        // If-Modified-Since, so unchanged passes just get a cheap 304.
        const changed = sinceMs === null
          ? cards
          : cards.filter((c) => Date.parse(c.passkit_last_updated) > sinceMs);
        console.log('[apple-wallet-webservice] updatable passes:', JSON.stringify({
          since, sinceMs, returned: changed.length, registered: cards.length,
        }));
        if (changed.length === 0) return new Response(null, { status: 204 });

        const lastUpdated = String(Math.max(0, ...changed.map((c) => Date.parse(c.passkit_last_updated) || 0)));
        return json({ lastUpdated, serialNumbers: changed.map((c) => c.id) });
      }
    }

    // ---- GET /v1/passes/{passType}/{serial}
    const passIdx = lower.indexOf('passes');
    if (req.method === 'GET' && passIdx >= 0) {
      const serial = parts[passIdx + 2];
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

    // ---- Fallback: echo what we actually received so routing is debuggable.
    return json(
      { error: 'route_not_matched', method: req.method, pathname: url.pathname, parts, rawUrl: req.url },
      404,
    );
  } catch (e) {
    console.error('[apple-wallet-webservice]', e);
    return new Response('Internal error', { status: 500 });
  }
});
