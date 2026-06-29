// supabase/functions/generate-apple-pass/index.ts
//
// Generates a signed Apple Wallet .pkpass for a customer's loyalty card.
//
// Apple .pkpass = a ZIP containing:
//   - pass.json          (the pass definition)
//   - icon.png, logo.png, strip.png (+ @2x/@3x)  (images)
//   - manifest.json      (SHA-1 of every file above)
//   - signature          (PKCS#7 detached signature of manifest.json)
//
// Signing requires three certs:
//   - Pass Type cert  (public; embedded below as APPLE_PASS_CERT_PEM default)
//   - Pass private key (SECRET; read from env APPLE_PASS_KEY_PEM)
//   - Apple WWDR G4   (public; embedded below)
//
// Secrets to set in Supabase (Dashboard → Edge Functions → Secrets):
//   APPLE_PASS_KEY_PEM    -> the contents of pass-key.pem (the PRIVATE KEY)
//   APPLE_PASS_KEY_PASSWORD -> the password you set on the .p12 (if the key
//                              is encrypted; if you exported with -nodes it's
//                              unencrypted and you can omit this)
//   APPLE_TEAM_ID         -> CL2ADKJNSU
//   APPLE_PASS_TYPE_ID    -> pass.app.stampfix.loyalty
//
// The pass cert + WWDR are embedded as defaults but can be overridden by
// env (APPLE_PASS_CERT_PEM / APPLE_WWDR_PEM) if they ever change.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resvg, initWasm } from 'npm:@resvg/resvg-wasm@2.6.2';
import forge from 'npm:node-forge@1.3.1';
import JSZip from 'npm:jszip@3.10.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---- Embedded public certs (safe to ship) -------------------------------

const PASS_CERT_PEM_DEFAULT = `-----BEGIN CERTIFICATE-----
MIIGJDCCBQygAwIBAgIQO93+s1U3jQKd7xfJKUIYMDANBgkqhkiG9w0BAQsFADB1
MUQwQgYDVQQDDDtBcHBsZSBXb3JsZHdpZGUgRGV2ZWxvcGVyIFJlbGF0aW9ucyBD
ZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTELMAkGA1UECwwCRzQxEzARBgNVBAoMCkFw
cGxlIEluYy4xCzAJBgNVBAYTAlVTMB4XDTI2MDYxNjIyMTcyNFoXDTI3MDcxNjIy
MTcyM1owgZsxKTAnBgoJkiaJk/IsZAEBDBlwYXNzLmFwcC5zdGFtcGZpeC5sb3lh
bHR5MTAwLgYDVQQDDCdQYXNzIFR5cGUgSUQ6IHBhc3MuYXBwLnN0YW1wZml4Lmxv
eWFsdHkxEzARBgNVBAsMCkNMMkFES0pOU1UxGjAYBgNVBAoMEUFiaGlzaGVrIEFi
aGlzaGVrMQswCQYDVQQGEwJERTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
ggEBAK/T69M4DXGCQhzg7aVWQyxeYau6hqv0NjctGnA04ort/c8caaPJOA33fF6E
V9B2+hEJi1nxWX/psIwXEIG9VdWJzQLv66SpLlqVYmakGqbqL4CW/Ptc/xF8kUno
m1AIhieqe8jGD4KjnaSi3ZE1UT7JBunOpf1de+SXY7ZliOgo1KiSfxk0MBiE42sB
5/3YO3G+0sIUEm/YSkvAJ16aPVfnojOpjRhTvhm/xBkX9xXG8zXpFd4GOJ0JsT0e
+vTnc4Ta2NE4PVk8tE2oF+yvY7KkKubcG04bNVipbLJgGQv3Q628ejtimXLzVJ5M
ED/5H+nI8xsJkhTjDaYwLuS0vJMCAwEAAaOCAocwggKDMAwGA1UdEwEB/wQCMAAw
HwYDVR0jBBgwFoAUW9n6HeeaGgujmXYiUIY+kchbd6gwcAYIKwYBBQUHAQEEZDBi
MC0GCCsGAQUFBzAChiFodHRwOi8vY2VydHMuYXBwbGUuY29tL3d3ZHJnNC5kZXIw
MQYIKwYBBQUHMAGGJWh0dHA6Ly9vY3NwLmFwcGxlLmNvbS9vY3NwMDMtd3dkcmc0
MDQwggEeBgNVHSAEggEVMIIBETCCAQ0GCSqGSIb3Y2QFATCB/zCBwwYIKwYBBQUH
AgIwgbYMgbNSZWxpYW5jZSBvbiB0aGlzIGNlcnRpZmljYXRlIGJ5IGFueSBwYXJ0
eSBhc3N1bWVzIGFjY2VwdGFuY2Ugb2YgdGhlIHRoZW4gYXBwbGljYWJsZSBzdGFu
ZGFyZCB0ZXJtcyBhbmQgY29uZGl0aW9ucyBvZiB1c2UsIGNlcnRpZmljYXRlIHBv
bGljeSBhbmQgY2VydGlmaWNhdGlvbiBwcmFjdGljZSBzdGF0ZW1lbnRzLjA3Bggr
BgEFBQcCARYraHR0cHM6Ly93d3cuYXBwbGUuY29tL2NlcnRpZmljYXRlYXV0aG9y
aXR5LzAeBgNVHSUEFzAVBggrBgEFBQcDAgYJKoZIhvdjZAQOMDIGA1UdHwQrMCkw
J6AloCOGIWh0dHA6Ly9jcmwuYXBwbGUuY29tL3d3ZHJnNC05LmNybDAdBgNVHQ4E
FgQUu2D5VU3I+u1d1zIRIbCwdMUFk3AwDgYDVR0PAQH/BAQDAgeAMCkGCiqGSIb3
Y2QGARAEGwwZcGFzcy5hcHAuc3RhbXBmaXgubG95YWx0eTAQBgoqhkiG92NkBgMC
BAIFADANBgkqhkiG9w0BAQsFAAOCAQEAvDDtA6b1apDH6/VJbVzrQKA+DjRstKCS
BcTG/j6auqWjJWwtMRshdVfflh65U7Tatb47KEZ3nTZcN1/S6vFsBjb+KOD0dHaP
geGHQwSlRlFl7yqrVfEbpNHoi/9oRPrQNNUZ4u8/N4CGpzmMfFGuLierx8+te2br
u3H0P8Ptr7tSPB3jCjAUW703PA2RKGwXZYH0jG//WfAhFvhv48/Tb4Sc6X7SpLxU
7Xeg285QulaQeiMQbph411Y/HDo8AkZxw8hLR6mN0ZcLmL7GMY8eSDk/xlttffds
T88zMXPb4lQMMG1ungPmGsfwiaaBhxJofyWk9q64yPD9C1fPgedIPQ==
-----END CERTIFICATE-----`;

const WWDR_PEM_DEFAULT = `-----BEGIN CERTIFICATE-----
MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQEL
-----END CERTIFICATE-----`;
// NOTE: the WWDR default above is truncated on purpose — set the full
// AppleWWDRCAG4 PEM via the APPLE_WWDR_PEM secret. See deploy notes.

// ---- Helpers ------------------------------------------------------------

function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required secret: ${name}`);
}

// SHA-1 hex of a byte array (Apple manifest uses SHA-1).
function sha1Hex(bytes: Uint8Array): string {
  const md = forge.md.sha1.create();
  md.update(forge.util.binary.raw.encode(bytes));
  return md.digest().toHex();
}

// Convert a #rrggbb (or #rgb) hex string into the rgb()/rgba() strings
// Apple's pass.json expects. Falls back to black on malformed input.
function hexToRgbParts(hex: string): [number, number, number] {
  const h = (hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.substring(0, 2), 16) || 0,
    parseInt(full.substring(2, 4), 16) || 0,
    parseInt(full.substring(4, 6), 16) || 0,
  ];
}
function hexToRgb(hex: string): string {
  const [r, g, b] = hexToRgbParts(hex);
  return `rgb(${r}, ${g}, ${b})`;
}
function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgbParts(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Build the stamp-progress strip as an SVG, then rasterize to PNG.
// Draws `maxStamps` brand-mark stamp icons that cycle through the Stampfix
// motif — rounded square, circle, cross — matching the in-app loyalty card.
// The first `filled` are solid (collected); the rest are a faint outline
// (square/circle) or faint fill (cross).
// Two rows when there are more than 5 stamps, with a clear gap between rows.
//
// Strip @3x is 1125x432 per Apple's storeCard spec. We draw at that size.
// No <text> is drawn, so the strip needs no font.
function buildStripSvg(filled: number, maxStamps: number, bg: string, text: string, _fontFamily: string): string {
  const W = 1125, H = 432;
  const solid = text;                       // collected-stamp fill (card ink)
  const faintFill = hexToRgba(text, 0.30);  // faint fill for an uncollected cross
  const faintLine = hexToRgba(text, 0.28);  // outline for an uncollected square/circle
  const SW = 6;                             // outline width for uncollected shapes

  // Two rows when more than 5 stamps (1-4 top, 5-8 bottom).
  const rows = maxStamps <= 5 ? 1 : 2;
  const perRow = Math.ceil(maxStamps / rows);
  // Smaller radius in 2-row mode to open up vertical room for a gap.
  const r = rows === 1
    ? Math.max(34, Math.min(78, (W / (perRow + 1)) * 0.40))
    : 56;

  // Row vertical centres. In 2-row mode push them apart; in 1-row mode centre.
  const rowCy = (row: number) => (rows === 1 ? H / 2 : row === 0 ? H * 0.29 : H * 0.71);

  // One stamp shape centred at (cx, cy), sized to the circle radius r. The
  // three motif shapes cycle by index so the strip reads as a repeating set.
  const shape = (kind: number, cx: number, cy: number, on: boolean): string => {
    const X = cx.toFixed(0), Y = cy.toFixed(0);
    if (kind === 0) {
      // rounded square
      const s = r * 1.78;
      const sx = (cx - s / 2).toFixed(0), sy = (cy - s / 2).toFixed(0);
      const side = s.toFixed(0), rx = (s * 0.16).toFixed(0);
      return `<rect x="${sx}" y="${sy}" width="${side}" height="${side}" rx="${rx}" fill="${on ? solid : 'none'}" stroke="${on ? 'none' : faintLine}" stroke-width="${SW}"/>`;
    }
    if (kind === 1) {
      // circle
      return `<circle cx="${X}" cy="${Y}" r="${r.toFixed(0)}" fill="${on ? solid : 'none'}" stroke="${on ? 'none' : faintLine}" stroke-width="${SW}"/>`;
    }
    // cross — two rounded bars forming an X (a stroke shape, so it takes a
    // faint fill rather than an outline when uncollected).
    const L = r * 2.0, t = r * 0.46;
    const bx = (cx - L / 2).toFixed(0), by = (cy - t / 2).toFixed(0);
    const len = L.toFixed(0), th = t.toFixed(0), rx = (t / 2).toFixed(0);
    const fill = on ? solid : faintFill;
    const bar = (deg: number) => `<rect x="${bx}" y="${by}" width="${len}" height="${th}" rx="${rx}" fill="${fill}" transform="rotate(${deg} ${X} ${Y})"/>`;
    return bar(45) + bar(-45);
  };

  let items = '';
  for (let i = 0; i < maxStamps; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    // Center the last row if it has fewer items than perRow.
    const itemsThisRow = Math.min(perRow, maxStamps - row * perRow);
    const rowGap = W / (itemsThisRow + 1);
    const cx = rowGap * (col + 1);
    const cy = rowCy(row);
    items += shape(i % 3, cx, cy, i < filled);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${items}</svg>`;
}

let wasmReady = false;
let fontBuffer: Uint8Array | null = null;
let fontTried = false;

// Family name resvg uses for the strip numbers. Must match the family of the
// TTF hosted at /wallet-assets/pass-font.ttf (Roboto-Bold.ttf => "Roboto").
const STRIP_FONT_FAMILY = 'Roboto';

// resvg has no system fonts in the serverless runtime, so without an explicit
// font the strip's <text> (the numbers) silently won't render. Load a TTF
// from the app's public assets once per cold start.
async function loadStripFont(origin: string): Promise<Uint8Array | null> {
  if (fontBuffer || fontTried) return fontBuffer;
  fontTried = true;
  try {
    const res = await fetch(`${origin}/wallet-assets/pass-font.ttf`);
    if (res.ok) fontBuffer = new Uint8Array(await res.arrayBuffer());
    else console.error('[generate-apple-pass] pass-font.ttf not found:', res.status);
  } catch (e) {
    console.error('[generate-apple-pass] font fetch failed:', e);
  }
  return fontBuffer;
}

async function svgToPng(svg: string, origin: string): Promise<Uint8Array> {
  if (!wasmReady) {
    // Fetch the wasm binary and initialise once per cold start.
    const wasmResp = await fetch('https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm');
    await initWasm(await wasmResp.arrayBuffer());
    wasmReady = true;
  }
  const font = await loadStripFont(origin);
  const opts = font
    ? { font: { fontBuffers: [font], loadSystemFonts: false, defaultFontFamily: STRIP_FONT_FAMILY } }
    : undefined;
  const resvg = new Resvg(svg, opts);
  const rendered = resvg.render();
  return rendered.asPng();
}

// ---- Main ---------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Accept cardId from query string (GET, direct navigation — needed for
    // iOS to receive the file with the right MIME type) or JSON body (POST).
    let cardId: string | undefined;
    if (req.method === 'GET') {
      cardId = new URL(req.url).searchParams.get('cardId') ?? undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      cardId = body.cardId;
    }
    if (!cardId) {
      return new Response(JSON.stringify({ error: 'cardId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-role client to read the card + campaign.
    const supabase = createClient(
      env('SUPABASE_URL'),
      env('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data: card, error: cardErr } = await supabase
      .from('cards')
      .select('id, customer_name, customer_code, current_stamps, rewards_redeemed, offer_title_snapshot, max_stamps_snapshot, campaign_id, apple_auth_token')
      .eq('id', cardId)
      .maybeSingle();
    if (cardErr || !card) {
      return new Response(JSON.stringify({ error: 'Card not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('business_name, offer_title, max_stamps, primary_color, background_color, card_text_color')
      .eq('id', card.campaign_id)
      .maybeSingle();

    const teamId = env('APPLE_TEAM_ID', 'CL2ADKJNSU');
    const passTypeId = env('APPLE_PASS_TYPE_ID', 'pass.app.stampfix.loyalty');
    const businessName = campaign?.business_name ?? 'Stampfix';
    const offerTitle = card.offer_title_snapshot ?? campaign?.offer_title ?? 'Loyalty card';
    const maxStamps = card.max_stamps_snapshot ?? campaign?.max_stamps ?? 8;
    const cardBg = campaign?.background_color || '#f0ece1';
    const cardText = campaign?.card_text_color || '#1d3458';
    const currentStamps = card.current_stamps ?? 0;
    const stampsLeft = Math.max(0, maxStamps - currentStamps);

    // Per-pass authentication token for the PassKit web service. Generated
    // once and stored on the card; the web service validates the
    // `Authorization: ApplePass <token>` header against it on every update
    // call from the device.
    let authToken = card.apple_auth_token as string | null;
    if (!authToken) {
      authToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      await supabase.from('cards').update({ apple_auth_token: authToken }).eq('id', card.id);
    }
    const webServiceURL = `${env('SUPABASE_URL')}/functions/v1/apple-wallet-webservice`;

    // ---- Build pass.json ----
    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      organizationName: businessName,
      description: `${businessName} loyalty card`,
      serialNumber: card.id,
      backgroundColor: hexToRgb(cardBg),
      foregroundColor: hexToRgb(cardText),
      labelColor: hexToRgb(cardText),
      logoText: businessName,
      webServiceURL,
      authenticationToken: authToken,
      storeCard: {
        headerFields: [
          {
            key: 'remaining',
            label: 'STAMPS LEFT',
            value: String(stampsLeft),
            // Shows a lock-screen notification when the count changes on an
            // automatic update (%@ = the new value). Without this, auto-updates
            // apply silently and are invisible to the customer.
            changeMessage: '%@ stamps left',
          },
        ],
        primaryFields: [],
        secondaryFields: [
          { key: 'member', label: 'MEMBER', value: card.customer_name ?? '' },
        ],
        auxiliaryFields: [
          {
            key: 'offer',
            label: 'REWARD',
            // When the card is full, flip the reward to a clear call-to-action
            // (and notify via changeMessage) instead of still showing the offer.
            value: stampsLeft === 0 ? 'Redeem your free reward now' : offerTitle,
            changeMessage: '%@',
            textAlignment: 'PKTextAlignmentCenter',
          },
        ],
      },
      barcode: {
        format: 'PKBarcodeFormatQR',
        message: card.id,
        messageEncoding: 'iso-8859-1',
        altText: card.customer_code ?? '',
      },
    };

    // ---- Assemble files (pass.json + images) ----
    // Images: we fetch the public PNG assets from the app origin so we
    // don't have to embed binaries here. They must exist at these paths.
    const origin = env('PUBLIC_APP_ORIGIN', 'https://stampfix.app');
    // logo.png (the Stampfix brand mark) is generated below and sits in the
    // top-left, just left of `logoText` (the merchant's business name).
    // icon.png is still required by Apple (notifications / lock screen).
    const imageNames = ['icon.png', 'icon@2x.png'];
    const files: Record<string, Uint8Array> = {};

    files['pass.json'] = new TextEncoder().encode(JSON.stringify(passJson));

    // Generate the dynamic stamp-progress strip (the row of coffee cups
    // that fill in as stamps are collected). If rasterization fails for
    // any reason, we skip it — the pass still renders, just without the
    // strip — so a strip error never blocks adding the card.
    try {
      const stripSvg = buildStripSvg(card.current_stamps ?? 0, maxStamps, cardBg, cardText, STRIP_FONT_FAMILY);
      const stripPng = await svgToPng(stripSvg, origin);
      files['strip.png'] = stripPng;
      files['strip@2x.png'] = stripPng;
      files['strip@3x.png'] = stripPng;
    } catch (stripErr) {
      console.error('[generate-apple-pass] strip generation failed:', stripErr);
    }

    // Stampfix brand mark in the top-left logo slot. Dark mark on light cards,
    // white on dark cards. Canvas is padded so it stays compact next to the
    // business name. Best-effort — a failure never blocks the pass.
    try {
      const lightCard = (() => {
        const m = /^#?([0-9a-fA-F]{6})$/.exec(String(cardBg).trim());
        if (!m) return true;
        const n = parseInt(m[1], 16);
        return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
      })();
      const logoFill = lightCard ? '#1A1A1A' : '#FFFFFF';
      const logoSvg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 282 150" width="282" height="150">` +
        `<g fill="${logoFill}" transform="translate(0 30)">` +
        `<rect x="8" y="12" width="66" height="66" rx="4"/><circle cx="140" cy="45" r="34"/>` +
        `<rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)"/>` +
        `<rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)"/></g></svg>`;
      const logoPng = await svgToPng(logoSvg, origin);
      files['logo.png'] = logoPng;
      files['logo@2x.png'] = logoPng;
      files['logo@3x.png'] = logoPng;
    } catch (logoErr) {
      console.error('[generate-apple-pass] logo generation failed:', logoErr);
    }

    for (const name of imageNames) {
      try {
        const res = await fetch(`${origin}/wallet-assets/${name}`);
        if (res.ok) {
          files[name] = new Uint8Array(await res.arrayBuffer());
        }
      } catch (_) {
        // Skip missing images; icon.png is the only hard requirement and
        // we surface an error below if it's missing.
      }
    }
    if (!files['icon.png']) {
      return new Response(JSON.stringify({
        error: 'Missing icon.png at ' + origin + '/wallet-assets/icon.png. Upload the wallet PNG assets to the public folder.',
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ---- manifest.json: SHA-1 of every file ----
    const manifest: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(files)) {
      manifest[name] = sha1Hex(bytes);
    }
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
    files['manifest.json'] = manifestBytes;

    // ---- Sign manifest.json (PKCS#7 detached) ----
    const certPem = env('APPLE_PASS_CERT_PEM', PASS_CERT_PEM_DEFAULT);
    const wwdrPem = env('APPLE_WWDR_PEM', WWDR_PEM_DEFAULT);
    const keyPem = env('APPLE_PASS_KEY_PEM'); // SECRET — no default
    const keyPassword = Deno.env.get('APPLE_PASS_KEY_PASSWORD') || undefined;

    const cert = forge.pki.certificateFromPem(certPem);
    const wwdr = forge.pki.certificateFromPem(wwdrPem);
    const privateKey = keyPassword
      ? forge.pki.decryptRsaPrivateKey(keyPem, keyPassword)
      : forge.pki.privateKeyFromPem(keyPem);

    if (!privateKey) {
      return new Response(JSON.stringify({ error: 'Could not load private key (wrong password?)' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(
      forge.util.binary.raw.encode(manifestBytes),
    );
    p7.addCertificate(cert);
    p7.addCertificate(wwdr);
    p7.addSigner({
      key: privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
      ],
    });
    p7.sign({ detached: true });

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    const signatureBytes = forge.util.binary.raw.decode(der);
    files['signature'] = signatureBytes;

    // ---- Zip everything into a .pkpass ----
    const zip = new JSZip();
    for (const [name, bytes] of Object.entries(files)) {
      zip.file(name, bytes);
    }
    const pkpass = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });

    return new Response(pkpass, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="stampfix-${card.customer_code ?? 'card'}.pkpass"`,
      },
    });
  } catch (e) {
    console.error('[generate-apple-pass]', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
