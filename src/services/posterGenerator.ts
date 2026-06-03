import type { Campaign, Location } from '../types';

export type PosterSize = 'card' | 'pamphlet' | 'poster';

interface BuildPosterInput {
  campaign: Campaign;
  /** Which physical format to render. The output HTML contains all
   *  three layouts but only one is visible based on this value. */
  size: PosterSize;
  /** The specific location whose QR is embedded. Each location gets its
   *  own join URL so we can attribute new signups to the right branch. */
  location?: Location | null;
  /** Allow callers to override the poster's join URL (e.g. for the
   *  Settings live-preview when no real location exists yet). */
  joinUrlOverride?: string;
  /** Optional override for the background. Used by the live preview in
   *  Settings — the user picks a color and we re-render before saving. */
  posterBgOverride?: string;
}

/**
 * Builds a complete, print-ready HTML document for the given size.
 *
 * Returns a full HTML string (including <html>/<head>) suitable for
 * window.open() + document.write(). The caller is responsible for
 * triggering the print dialog or letting the user use Cmd/Ctrl+P.
 *
 * Why HTML instead of SVG or canvas:
 *   - HTML/CSS gives us the layout flexibility we need at three very
 *     different aspect ratios (business card, A5 landscape, A4 portrait)
 *   - Browser print is universal — every merchant has it, no installs,
 *     no licensing fees, works at the merchant's actual paper size
 *   - The QR code is a separate <img> we generate via a third-party
 *     service (api.qrserver.com), which is free and reliable
 */
export function buildPosterHtml(input: BuildPosterInput): string {
  const { campaign, location, joinUrlOverride, posterBgOverride } = input;

  // ----- Resolve dynamic values from the campaign -----
  const businessName = (campaign.businessName || 'Your Business').toUpperCase();
  // Use logoText (the merchant's 1-3 word tagline) for the vertical
  // brand strip if set, otherwise fall back to business name.
  const verticalBrand = (campaign.logoText || campaign.businessName || 'STAMPFIX').toUpperCase();
  const icon = campaign.customIcon || '☕';
  const offerTitle = campaign.offerTitle || 'Collect stamps, get a reward';
  const maxStamps = campaign.maxStamps || 6;

  // Background: caller override > merchant's stored poster_color > fall back to primary
  const posterBg = posterBgOverride ?? campaign.posterColor ?? campaign.primaryColor;

  // Yellow stays as the accent across all themes; deep navy as the
  // starburst text color. We assume the merchant's background is dark
  // enough that white text + yellow accent work — the default and the
  // presets all satisfy this. (We can add a brightness check later.)

  // ----- Build the join URL -----
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://stampfix.app';
  const params = new URLSearchParams({ campaign: campaign.id });
  if (location?.id) params.set('location', location.id);
  const joinUrl = joinUrlOverride ?? `${origin}/?${params.toString()}`;

  // ----- Build the starburst text dynamically from the offer -----
  // Try to break it into 3-4 short lines so it sits well inside the
  // sunburst. The offer text is usually short ("Collect 6 stamps, get 1
  // free coffee"), so we wrap each word group manually. If the merchant
  // writes something longer we just let it word-wrap; CSS clip-path
  // will still contain it.
  const starburstText = formatStarburst(offerTitle, maxStamps);

  // QR code from a free, reliable service. It only takes a URL, no
  // signup, no API key. The URL we pass through is the actual join
  // URL with embedded campaign+location params.
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(joinUrl)}`;

  // The example "0" stamp count and "Alex" / "06/03/26" footer are
  // illustrative — they show the customer what a card LOOKS like.
  // Real customers fill them with their own data after signup.

  return PAGE_TEMPLATE
    .replaceAll('__POSTER_BG__',      posterBg)
    .replaceAll('__BUSINESS_NAME__',  esc(businessName))
    .replaceAll('__VERTICAL_BRAND__', esc(verticalBrand))
    .replaceAll('__ICON__',           esc(icon))
    .replaceAll('__OFFER_TITLE__',    esc(offerTitle))
    .replaceAll('__STARBURST__',      starburstText)
    .replaceAll('__QR_URL__',         qrUrl)
    .replaceAll('__STAMPS_GRID__',    buildStampsGrid(maxStamps, icon))
    .replaceAll('__OFFER_PILL__',     esc(condenseOfferForPill(offerTitle, maxStamps)))
    .replaceAll('__SIZE__',           input.size);
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildStampsGrid(maxStamps: number, icon: string): string {
  const safeIcon = esc(icon);
  return Array.from({ length: maxStamps }, (_, i) =>
    `<div class="stamp-bubble">${i + 1}</div>`
  ).join('');
  // Note: the icon variable is intentionally unused in the grid because
  // these are EMPTY stamp slots (the customer hasn't earned them yet).
  // The real card uses the icon on FILLED stamps. We could show 0/N
  // filled here, but the simple "1-6" labelling reads more clearly
  // on a poster than empty circles.
  void safeIcon;
}

/**
 * Compresses the merchant's offer title into a short starburst-friendly
 * string. The starburst is small and rotates; long sentences look bad.
 * Examples:
 *   ("Collect 6 stamps, get 1 free coffee", 6)
 *     → "COLLECT<br>6 STAMPS,<br>GET 1 FREE<br>COFFEE"
 *   ("Buy 6, get 1 free", 6)
 *     → "BUY 6,<br>GET 1<br>FREE"
 *
 * Implementation: just uppercase and split into ~3-4 lines by length.
 * If the merchant writes something weird, the CSS clip-path still
 * contains it visually.
 */
function formatStarburst(offerTitle: string, _maxStamps: number): string {
  const words = offerTitle.toUpperCase().trim().split(/\s+/);
  if (words.length === 0) return 'JOIN';

  // Greedy line break: aim for ~12 chars per line.
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > 12 && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  // Cap at 4 lines so it fits inside the starburst.
  return lines.slice(0, 4).map(esc).join('<br>');
}

/**
 * Shorter version of the offer for the in-card "pill" caption below
 * the stamp grid. Real card uses this same value via the snapshot.
 */
function condenseOfferForPill(offerTitle: string, maxStamps: number): string {
  // If the title is already short enough, use as-is. Otherwise fall
  // back to a generic "N → 1 FREE" template that's always concise.
  const upper = offerTitle.toUpperCase();
  if (upper.length <= 30) return upper;
  return `${maxStamps} STAMPS → 1 FREE`;
}

// =====================================================================
// THE TEMPLATE
//
// One HTML document holds all three formats. The body sets `data-size`
// via a small script reading a URL hash (#card, #pamphlet, #poster) so
// we can serve the same generated file but pick which size renders.
// CSS gates each layout to its `.size-*` class.
// =====================================================================

const PAGE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>__BUSINESS_NAME__ — Loyalty Poster</title>
<style>
  /* Reset + sensible defaults */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', 'Segoe UI', Arial, sans-serif; background: #f5f5f5; }

  /* Each format is its own page. Print rules use the matching @page. */
  @media print {
    body { background: none; }
    .controls { display: none !important; }
    .size-card,
    .size-pamphlet,
    .size-poster { box-shadow: none !important; margin: 0 !important; }
  }

  /* On-screen controls — hidden when printing */
  .controls {
    position: fixed; top: 16px; right: 16px;
    z-index: 100; display: flex; gap: 8px;
    background: white; padding: 8px 12px; border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    font-size: 14px;
  }
  .controls button {
    background: #37352F; color: white; border: none; padding: 8px 14px;
    border-radius: 5px; cursor: pointer; font-weight: 500; font-size: 13px;
  }
  .controls button:hover { background: #1a1918; }

  /* ============================
   *  BUSINESS CARD (85x55mm)
   * ============================ */
  @page card { size: 85mm 55mm; margin: 0; }
  .size-card {
    width: 850px; height: 550px;
    background: __POSTER_BG__;
    color: white; position: relative; overflow: hidden;
    display: flex; margin: 30px auto; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  }
  .size-card .bc-left {
    flex: 1; padding: 50px 40px;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative; z-index: 2;
  }
  .size-card .bc-biz {
    font-size: 22px; font-weight: 700; letter-spacing: 4px;
    text-transform: uppercase; margin-bottom: 8px; opacity: 0.85;
  }
  .size-card .bc-headline {
    font-size: 72px; font-weight: 900; line-height: 0.9;
    letter-spacing: -2px; text-transform: uppercase;
  }
  .size-card .bc-tagline {
    font-size: 17px; font-weight: 500; opacity: 0.9;
    line-height: 1.3; max-width: 320px;
  }
  .size-card .bc-right {
    width: 380px; background: white;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 30px; position: relative;
    gap: 14px;
  }
  .size-card .bc-scan-label {
    font-size: 14px; font-weight: 700;
    color: #1E40AF; text-transform: uppercase;
    letter-spacing: 2px; text-align: center;
    position: relative; z-index: 6;
  }
  .size-card .bc-qr {
    position: relative; z-index: 6;
  }
  .size-card .bc-qr img { width: 230px; height: 230px; display: block; }
  .size-card .bc-starburst {
    position: absolute; bottom: 14px; right: 14px;
    width: 110px; height: 110px;
    background: #FBBF24; color: #1E3A8A;
    display: flex; align-items: center; justify-content: center;
    text-align: center; transform: rotate(8deg);
    clip-path: polygon(
      50% 0%, 61% 14%, 75% 5%, 79% 22%, 95% 20%, 90% 38%,
      100% 50%, 90% 62%, 95% 80%, 79% 78%, 75% 95%, 61% 86%,
      50% 100%, 39% 86%, 25% 95%, 21% 78%, 5% 80%, 10% 62%,
      0% 50%, 10% 38%, 5% 20%, 21% 22%, 25% 5%, 39% 14%
    );
    z-index: 5;
    padding: 18px;
  }
  .size-card .bc-starburst-inner {
    font-size: 9px; font-weight: 900; line-height: 1.15;
  }
  .size-card .bc-powered {
    position: absolute; bottom: 16px; left: 40px;
    font-size: 11px; font-weight: 600;
    color: rgba(255,255,255,0.6); letter-spacing: 1.5px; z-index: 3;
  }
  .size-card .bc-powered strong { color: rgba(255,255,255,0.85); }

  /* ============================
   *  A5 PAMPHLET (210x148mm landscape)
   * ============================ */
  @page pamphlet { size: A5 landscape; margin: 0; }
  .size-pamphlet {
    width: 1123px; height: 794px;
    background: __POSTER_BG__;
    color: white; position: relative; overflow: hidden; display: flex;
    margin: 30px auto; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  }
  .size-pamphlet .pm-vbrand {
    position: absolute; left: 0; top: 0; bottom: 0; width: 50px;
    display: flex; flex-direction: column; align-items: center;
    justify-content: space-evenly; padding: 60px 0; z-index: 5;
  }
  .size-pamphlet .pm-vbrand span {
    writing-mode: vertical-rl; transform: rotate(180deg);
    font-size: 14px; font-weight: 700; letter-spacing: 5px;
    color: #FBBF24; text-transform: uppercase; white-space: nowrap;
  }
  .size-pamphlet .pm-left {
    width: 580px; padding: 60px 40px 80px 90px;
    display: flex; flex-direction: column; justify-content: space-between;
    position: relative; z-index: 2;
  }
  .size-pamphlet .pm-biz {
    font-size: 20px; font-weight: 700; letter-spacing: 5px;
    text-transform: uppercase; margin-bottom: 14px; opacity: 0.9;
  }
  .size-pamphlet .pm-headline {
    font-size: 110px; font-weight: 900; line-height: 0.9;
    letter-spacing: -3px; text-transform: uppercase; margin-bottom: 18px;
  }
  .size-pamphlet .pm-subheading {
    font-size: 18px; font-weight: 500; opacity: 0.85;
    max-width: 380px; line-height: 1.4;
  }
  .size-pamphlet .pm-signup-h {
    font-size: 30px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 2px; margin-bottom: 20px;
  }
  .size-pamphlet .pm-steps { display: flex; flex-direction: column; gap: 14px; }
  .size-pamphlet .pm-step {
    display: flex; align-items: center; gap: 14px;
    font-size: 20px; font-weight: 500;
  }
  .size-pamphlet .pm-step .text { flex: 1; }
  .size-pamphlet .pm-cb {
    width: 26px; height: 26px; border: 2.5px solid white;
    border-radius: 5px; flex-shrink: 0;
  }
  .size-pamphlet .pm-stepi { width: 30px; font-size: 26px; text-align: center; flex-shrink: 0; }
  .size-pamphlet .pm-right {
    flex: 1; position: relative; padding-right: 50px;
    display: flex; align-items: center; justify-content: center;
  }
  .size-pamphlet .pm-starburst {
    position: absolute; top: 50px; right: 30px;
    width: 170px; height: 170px;
    background: #FBBF24; color: #1E3A8A;
    display: flex; align-items: center; justify-content: center;
    text-align: center; font-size: 13px; font-weight: 900; line-height: 1.2;
    padding: 28px; transform: rotate(12deg);
    clip-path: polygon(
      50% 0%, 61% 14%, 75% 5%, 79% 22%, 95% 20%, 90% 38%,
      100% 50%, 90% 62%, 95% 80%, 79% 78%, 75% 95%, 61% 86%,
      50% 100%, 39% 86%, 25% 95%, 21% 78%, 5% 80%, 10% 62%,
      0% 50%, 10% 38%, 5% 20%, 21% 22%, 25% 5%, 39% 14%
    );
    z-index: 10;
  }
  .size-pamphlet .pm-starburst-inner { max-width: 110px; word-wrap: break-word; }
  .size-pamphlet .pm-powered {
    position: absolute; bottom: 24px; left: 90px;
    font-size: 12px; font-weight: 600;
    color: rgba(255,255,255,0.55); letter-spacing: 2px; z-index: 3;
  }
  .size-pamphlet .pm-powered strong { color: rgba(255,255,255,0.85); }

  /* ============================
   *  A4 POSTER (210x297mm portrait)
   * ============================ */
  @page poster { size: A4 portrait; margin: 0; }
  .size-poster {
    width: 794px; height: 1123px;
    background: __POSTER_BG__;
    color: white; position: relative; overflow: hidden;
    margin: 30px auto; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  }
  .size-poster .ps-vbrand {
    position: absolute; left: 0; top: 0; bottom: 0; width: 56px;
    display: flex; flex-direction: column; align-items: center;
    justify-content: space-evenly; padding: 90px 0; z-index: 5;
  }
  .size-poster .ps-vbrand span {
    writing-mode: vertical-rl; transform: rotate(180deg);
    font-size: 16px; font-weight: 700; letter-spacing: 7px;
    color: #FBBF24; text-transform: uppercase; white-space: nowrap;
  }
  .size-poster .ps-content {
    position: absolute; inset: 0;
    padding: 80px 70px 80px 100px;
    display: flex; flex-direction: column;
  }
  .size-poster .ps-biz {
    font-size: 22px; font-weight: 700; letter-spacing: 6px;
    text-transform: uppercase; margin-bottom: 16px; opacity: 0.95;
  }
  .size-poster .ps-headline {
    font-size: 130px; font-weight: 900; line-height: 0.92;
    letter-spacing: -4px; text-transform: uppercase; max-width: 420px;
  }
  .size-poster .ps-subheading {
    font-size: 20px; font-weight: 500; opacity: 0.85;
    max-width: 320px; margin-top: 16px; line-height: 1.4;
  }
  .size-poster .ps-signup {
    margin-top: auto; width: 380px; max-width: 380px;
  }
  .size-poster .ps-signup-h {
    font-size: 42px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 2px; margin-bottom: 28px; line-height: 0.95;
  }
  .size-poster .ps-step {
    display: flex; align-items: center; gap: 18px;
    margin-bottom: 22px; font-size: 24px; font-weight: 500; line-height: 1.3;
  }
  .size-poster .ps-step .text { flex: 1; }
  .size-poster .ps-cb {
    width: 32px; height: 32px; border: 3px solid white;
    border-radius: 6px; flex-shrink: 0;
  }
  .size-poster .ps-stepi { width: 36px; font-size: 30px; text-align: center; flex-shrink: 0; }
  .size-poster .ps-starburst {
    position: absolute; top: 70px; right: 70px;
    width: 200px; height: 200px;
    background: #FBBF24; color: #1E3A8A;
    display: flex; align-items: center; justify-content: center;
    text-align: center; font-size: 15px; font-weight: 900; line-height: 1.2;
    padding: 28px; transform: rotate(12deg);
    clip-path: polygon(
      50% 0%, 61% 14%, 75% 5%, 79% 22%, 95% 20%, 90% 38%,
      100% 50%, 90% 62%, 95% 80%, 79% 78%, 75% 95%, 61% 86%,
      50% 100%, 39% 86%, 25% 95%, 21% 78%, 5% 80%, 10% 62%,
      0% 50%, 10% 38%, 5% 20%, 21% 22%, 25% 5%, 39% 14%
    );
    z-index: 10;
  }
  .size-poster .ps-starburst-inner { max-width: 130px; word-wrap: break-word; }
  .size-poster .ps-powered {
    position: absolute; bottom: 36px; left: 100px;
    font-size: 13px; font-weight: 600;
    color: rgba(255,255,255,0.55); letter-spacing: 2.5px; z-index: 3;
  }
  .size-poster .ps-powered strong { color: rgba(255,255,255,0.85); }

  /* ============================
   *  PHONE MOCKUP (shared by pamphlet + poster)
   * ============================ */
  .phone-mockup {
    background: #1f2937; border-radius: 38px; padding: 8px;
    box-shadow: 0 30px 60px rgba(0,0,0,0.4);
  }
  .size-pamphlet .phone-mockup { width: 280px; height: 580px; transform: rotate(6deg); }
  .size-poster .phone-mockup {
    position: absolute; right: 50px; top: 320px;
    width: 270px; height: 560px; transform: rotate(7deg); z-index: 6;
  }
  .phone-screen {
    background: white; height: 100%;
    border-radius: 30px; overflow: hidden;
    display: flex; flex-direction: column; color: #111;
    background-image: radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px);
    background-size: 12px 12px;
  }
  .phc-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 16px 16px 6px;
  }
  .phc-left { display: flex; align-items: center; gap: 8px; }
  .phc-logo {
    width: 28px; height: 28px; background: #f9fafb;
    border: 1px solid #f3f4f6; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
  }
  .phc-biz {
    font-size: 9px; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase; line-height: 1.1; max-width: 100px;
  }
  .phc-stamps-label {
    font-size: 7px; color: #9ca3af; text-transform: uppercase;
    font-weight: 700; letter-spacing: 1.5px; margin-bottom: 2px;
  }
  .phc-stamps { font-size: 18px; font-weight: 700; line-height: 1; }
  .phc-stamps-area {
    flex: 1; display: flex; flex-direction: column;
    justify-content: center; align-items: center; padding: 6px 16px;
  }
  .phc-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 18px; margin-bottom: 12px;
  }
  .stamp-bubble {
    width: 44px; height: 44px; border-radius: 50%;
    background: #f9fafb; border: 1.5px solid #e5e7eb;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; color: #d1d5db; font-size: 14px;
  }
  .phc-pill {
    font-size: 8px; color: #9ca3af; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1.5px;
    background: #f9fafb; padding: 4px 12px; border-radius: 999px;
    border: 1px solid #f3f4f6; max-width: 200px; text-align: center;
  }
  .phc-footer {
    background: #f9fafb; border-top: 1px solid #f3f4f6;
    padding: 12px 16px;
  }
  .phc-footer-row {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-bottom: 10px;
  }
  .phc-flabel {
    font-size: 6px; color: #9ca3af; text-transform: uppercase;
    font-weight: 700; letter-spacing: 1.5px; margin-bottom: 2px;
  }
  .phc-fvalue { font-size: 9px; font-weight: 700; color: #111; }
  .phc-fvalue.mono {
    font-family: 'SF Mono', monospace; font-weight: 500;
    color: #6b7280; font-size: 8px;
  }
  .phc-qr-frame {
    background: white; padding: 5px; border-radius: 5px;
    border: 1px solid #e5e7eb; width: fit-content; margin: 0 auto;
  }
  .phc-qr-frame img { width: 76px; height: 76px; display: block; }
</style>
</head>
<body data-size="__SIZE__">
  <div class="controls">
    <button onclick="window.print()">🖨️ Print</button>
    <button onclick="window.close()">Close</button>
  </div>

  <!-- ============= BUSINESS CARD ============= -->
  <div class="size-card">
    <div class="bc-left">
      <div>
        <div class="bc-biz">__BUSINESS_NAME__</div>
        <h1 class="bc-headline">SCAN<br>&amp; SAVE</h1>
      </div>
      <div class="bc-tagline">
        Join our loyalty program — earn rewards every visit.
      </div>
    </div>
    <div class="bc-right">
      <div class="bc-scan-label">Scan to join</div>
      <div class="bc-qr">
        <img src="__QR_URL__" alt="Scan to join" />
      </div>
    </div>
    <div class="bc-starburst">
      <div class="bc-starburst-inner">__STARBURST__</div>
    </div>
    <div class="bc-powered">POWERED BY <strong>STAMPFIX.APP</strong></div>
  </div>

  <!-- ============= A5 PAMPHLET ============= -->
  <div class="size-pamphlet">
    <div class="pm-vbrand">
      <span>__VERTICAL_BRAND__</span>
      <span>__VERTICAL_BRAND__</span>
    </div>
    <div class="pm-left">
      <div>
        <div class="pm-biz">__BUSINESS_NAME__</div>
        <h1 class="pm-headline">SCAN<br>&amp; SAVE</h1>
        <p class="pm-subheading">Loyalty card right in your phone — no app to download.</p>
      </div>
      <div>
        <div class="pm-signup-h">How to sign up</div>
        <div class="pm-steps">
          <div class="pm-step"><div class="pm-cb"></div><div class="text">Scan the QR code</div></div>
          <div class="pm-step"><div class="pm-cb"></div><div class="text">Register your name &amp; email</div></div>
          <div class="pm-step"><div class="pm-cb"></div><div class="text">Save card to Google Wallet</div></div>
          <div class="pm-step"><div class="pm-stepi">__ICON__</div><div class="text">Enjoy!</div></div>
        </div>
      </div>
    </div>
    <div class="pm-right">
      <div class="phone-mockup">
        <div class="phone-screen">
          <div class="phc-header">
            <div class="phc-left">
              <div class="phc-logo">__ICON__</div>
              <div class="phc-biz">__BUSINESS_NAME__</div>
            </div>
            <div style="text-align: right;">
              <div class="phc-stamps-label">Stamps</div>
              <div class="phc-stamps">0</div>
            </div>
          </div>
          <div class="phc-stamps-area">
            <div class="phc-grid">__STAMPS_GRID__</div>
            <div class="phc-pill">__OFFER_PILL__</div>
          </div>
          <div class="phc-footer">
            <div class="phc-footer-row">
              <div>
                <div class="phc-flabel">Holder</div>
                <div class="phc-fvalue">Alex</div>
              </div>
              <div style="text-align: right;">
                <div class="phc-flabel">Joined</div>
                <div class="phc-fvalue mono">today</div>
              </div>
            </div>
            <div class="phc-qr-frame">
              <img src="__QR_URL__" />
            </div>
          </div>
        </div>
      </div>
      <div class="pm-starburst">
        <div class="pm-starburst-inner">__STARBURST__</div>
      </div>
    </div>
    <div class="pm-powered">POWERED BY <strong>STAMPFIX.APP</strong></div>
  </div>

  <!-- ============= A4 POSTER ============= -->
  <div class="size-poster">
    <div class="ps-vbrand">
      <span>__VERTICAL_BRAND__</span>
      <span>__VERTICAL_BRAND__</span>
    </div>
    <div class="ps-content">
      <div>
        <div class="ps-biz">__BUSINESS_NAME__</div>
        <h1 class="ps-headline">SCAN<br>&amp; SAVE</h1>
        <p class="ps-subheading">Loyalty card in your phone — no app to download.</p>
      </div>
      <div class="ps-signup">
        <div class="ps-signup-h">How to<br>sign up:</div>
        <div class="ps-step"><div class="ps-cb"></div><div class="text">Scan the QR code</div></div>
        <div class="ps-step"><div class="ps-cb"></div><div class="text">Register your name &amp; email</div></div>
        <div class="ps-step"><div class="ps-cb"></div><div class="text">Save card to Google Wallet</div></div>
        <div class="ps-step"><div class="ps-stepi">__ICON__</div><div class="text">Enjoy your reward!</div></div>
      </div>
    </div>
    <div class="ps-starburst">
      <div class="ps-starburst-inner">__STARBURST__</div>
    </div>
    <div class="phone-mockup">
      <div class="phone-screen">
        <div class="phc-header">
          <div class="phc-left">
            <div class="phc-logo">__ICON__</div>
            <div class="phc-biz">__BUSINESS_NAME__</div>
          </div>
          <div style="text-align: right;">
            <div class="phc-stamps-label">Stamps</div>
            <div class="phc-stamps">0</div>
          </div>
        </div>
        <div class="phc-stamps-area">
          <div class="phc-grid">__STAMPS_GRID__</div>
          <div class="phc-pill">__OFFER_PILL__</div>
        </div>
        <div class="phc-footer">
          <div class="phc-footer-row">
            <div>
              <div class="phc-flabel">Holder</div>
              <div class="phc-fvalue">Alex</div>
            </div>
            <div style="text-align: right;">
              <div class="phc-flabel">Joined</div>
              <div class="phc-fvalue mono">today</div>
            </div>
          </div>
          <div class="phc-qr-frame">
            <img src="__QR_URL__" />
          </div>
        </div>
      </div>
    </div>
    <div class="ps-powered">POWERED BY <strong>STAMPFIX.APP</strong></div>
  </div>

<script>
  // Hide non-selected size formats based on body[data-size]. This lets
  // the merchant print just the size they downloaded.
  (function() {
    var size = document.body.dataset.size || 'poster';
    var validSizes = ['card', 'pamphlet', 'poster'];
    if (!validSizes.includes(size)) size = 'poster';
    var sel = '.size-' + size;
    document.querySelectorAll('.size-card, .size-pamphlet, .size-poster').forEach(function(el) {
      if (!el.matches(sel)) el.style.display = 'none';
    });
    // Use the right @page rule on print so paper size matches.
    var style = document.createElement('style');
    style.textContent = '@page { size: ' + (
      size === 'card' ? '85mm 55mm'
      : size === 'pamphlet' ? 'A5 landscape'
      : 'A4 portrait'
    ) + '; margin: 0; }';
    document.head.appendChild(style);
  })();
</script>
</body>
</html>`;
