import type { Campaign, Location } from '../types';

export type PosterSize = 'card' | 'pamphlet' | 'poster' | 'instagram' | 'table' | 'sticker';

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
  const businessNameRaw = campaign.businessName || 'Your Business';
  // Use logoText (the merchant's 1-3 word tagline) for the vertical
  // brand strip if set, otherwise fall back to business name.
  const verticalBrand = (campaign.logoText || campaign.businessName || 'STAMPFIX').toUpperCase();
  const icon = campaign.customIcon || '☕';
  const offerTitle = campaign.offerTitle || 'Collect stamps, get a reward';
  const maxStamps = campaign.maxStamps || 6;

  // ----- Colour resolution -----
  const isHex = (c: unknown) => /^#?([0-9a-fA-F]{6})$/.test(String(c).trim());
  const lumOf = (c: string) => {
    const n = parseInt(/^#?([0-9a-fA-F]{6})$/.exec(c.trim())![1], 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };

  // Poster background: clean white by default. Honour an explicit colour —
  // a solid hex OR a CSS gradient string (from the gradient picker) — from
  // the override / campaign; otherwise white. (Gradients must NOT be hex-
  // validated away, or the custom-gradient picker silently renders white.)
  let posterBg = posterBgOverride ?? campaign.posterColor ?? '#FFFFFF';
  const isGradient = /gradient\(/i.test(String(posterBg));
  if (!isGradient && !isHex(posterBg)) posterBg = '#FFFFFF';

  // Adaptive theme: dark ink on a light background, white ink on a dark one.
  // For a gradient, average its colour stops to decide which reads better.
  const bgLum = isGradient
    ? (() => {
        const stops = String(posterBg).match(/#[0-9a-fA-F]{6}/g) ?? [];
        return stops.length ? stops.reduce((a, h) => a + lumOf(h), 0) / stops.length : 80;
      })()
    : lumOf(posterBg);
  const lightBg = bgLum > 150;
  const ink = lightBg ? '#1A1A1A' : '#FFFFFF';
  const inkSoft = lightBg ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
  const vbrand = lightBg ? '#9B8B66' : '#FBBF24';

  // Dummy-card colour: the customer's real card colour, or a creamy default.
  const cardBg = isHex(campaign.primaryColor)
    ? (campaign.primaryColor as string)
    : isHex(campaign.posterColor)
      ? (campaign.posterColor as string)
      : '#f0ece1';
  const cardInk = isHex(cardBg) && lumOf(cardBg) > 150 ? '#26314D' : '#FFFFFF';

  const markPaths =
    `<rect x="8" y="12" width="66" height="66" rx="4"/><circle cx="140" cy="45" r="34"/>` +
    `<rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)"/>` +
    `<rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)"/>`;
  const markHex = lightBg ? '#1A1A1A' : '#FFFFFF';
  const brandMark =
    `<svg viewBox="0 0 282 90" style="height:11px;width:auto;vertical-align:middle;margin-right:5px;display:inline-block" fill="${markHex}">${markPaths}</svg>`;
  const cardMark =
    `<svg viewBox="0 0 282 90" style="height:18px;width:auto;vertical-align:middle;display:inline-block" fill="${cardInk}">${markPaths}</svg>`;

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
  const stickerCells = Array.from({ length: 20 }, () => `<div class="st-cell"><img src="${qrUrl}" alt="Scan to join"/><span>Scan to join</span></div>`).join('');

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
    .replaceAll('__STICKER_CELLS__',  stickerCells)
    .replaceAll('__QR_URL__',         qrUrl)
    .replaceAll('__STAMPS_GRID__',    buildStampsGrid(maxStamps, icon))
    .replaceAll('__OFFER_PILL__',     esc(condenseOfferForPill(offerTitle, maxStamps)))
    .replaceAll('__BRAND_MARK__',     brandMark)
    .replaceAll('__CARD_MARK__',      cardMark)
    .replaceAll('__BUSINESS_NAME_RAW__', esc(businessNameRaw))
    .replaceAll('__CARD_BG__',        cardBg)
    .replaceAll('__CARD_INK__',       cardInk)
    .replaceAll('__INK__',            ink)
    .replaceAll('__INK_SOFT__',       inkSoft)
    .replaceAll('__VBRAND__',         vbrand)
    .replaceAll('__DUMMY_STAMPS__',   buildDummyStamps(maxStamps))
    .replaceAll('__PAGE__',           input.size === 'card' ? '85mm 55mm' : input.size === 'pamphlet' ? '210mm 148mm' : input.size === 'instagram' ? '210mm 210mm' : input.size === 'table' ? '45mm 45mm' : input.size === 'sticker' ? '210mm 297mm' : '210mm 297mm')
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
function buildDummyStamps(maxStamps: number): string {
  const kinds = ['sq', 'ci', 'cx'];
  const n = Math.max(1, maxStamps);
  const offFrom = Math.max(1, n - 2); // leave the last ~2 unstamped, like a real in-use card
  let out = '';
  for (let i = 0; i < n; i++) {
    const k = kinds[i % 3];
    const off = i >= offFrom ? ' off' : '';
    const inner = k === 'cx'
      ? '<svg viewBox="0 0 40 40"><line x1="8" y1="8" x2="32" y2="32"/><line x1="32" y1="8" x2="8" y2="32"/></svg>'
      : '';
    out += `<div class="dc-shape ${k}${off}">${inner}</div>`;
  }
  return out;
}

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
  /* Pin the printed page to the chosen format so it never spills to a 2nd page. */
  @page { size: __PAGE__; margin: 0; }
  /* Reset + sensible defaults */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', 'Segoe UI', Arial, sans-serif; background: #f5f5f5;
    --ink: __INK__; --ink-soft: __INK_SOFT__; --vbrand: __VBRAND__;
  }

  /* Each format is its own page. Print rules use the matching @page. */
  @media print {
    body { background: none; }
    .controls { display: none !important; }
    .size-card,
    .size-pamphlet,
    .size-poster,
    .size-instagram,
    .size-table,
    .size-sticker { box-shadow: none !important; margin: 0 !important; }
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
    color: var(--ink); position: relative; overflow: hidden;
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
  .size-card .bc-noapp {
    margin-top: 12px; font-size: 20px; font-weight: 600;
    letter-spacing: 0.3px; opacity: 0.92;
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
    color: var(--ink-soft); letter-spacing: 1.5px; z-index: 3;
  }
  .size-card .bc-powered strong { color: var(--ink); }

  /* ============================
   *  A5 PAMPHLET (210x148mm landscape)
   * ============================ */
  @page pamphlet { size: A5 landscape; margin: 0; }
  .size-pamphlet {
    width: 1123px; height: 794px;
    background: __POSTER_BG__;
    color: var(--ink); position: relative; overflow: hidden; display: flex;
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
    color: var(--vbrand); text-transform: uppercase; white-space: nowrap;
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
  .size-pamphlet .pm-step .text { flex: 1; min-width: 0; }
  .size-pamphlet .pm-cb {
    width: 26px; height: 26px; border: 2.5px solid var(--ink);
    border-radius: 5px; flex-shrink: 0;
  }
  .size-pamphlet .pm-stepi { width: 30px; font-size: 26px; text-align: center; flex-shrink: 0; }
  .size-pamphlet .pm-right {
    flex: 1; position: relative; padding-right: 50px;
    display: flex; flex-direction: column; gap: 22px;
    align-items: center; justify-content: center;
  }
  .size-pamphlet .pm-starburst {
    position: absolute; top: 14px; right: 16px;
    width: 122px; height: 122px;
    background: #FBBF24; color: #1E3A8A;
    display: flex; align-items: center; justify-content: center;
    text-align: center; font-size: 10px; font-weight: 900; line-height: 1.15;
    padding: 16px; transform: rotate(12deg);
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
    color: var(--ink-soft); letter-spacing: 2px; z-index: 3;
  }
  .size-pamphlet .pm-powered strong { color: var(--ink); }

  /* ============================
   *  A4 POSTER (210x297mm portrait)
   * ============================ */
  @page poster { size: A4 portrait; margin: 0; }
  .size-poster {
    width: 794px; height: 1123px;
    background: __POSTER_BG__;
    color: var(--ink); position: relative; overflow: hidden;
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
    color: var(--vbrand); text-transform: uppercase; white-space: nowrap;
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
    font-size: 100px; font-weight: 900; line-height: 0.92;
    letter-spacing: -3px; text-transform: uppercase; max-width: 380px;
  }
  .size-poster .ps-subheading {
    font-size: 20px; font-weight: 500; opacity: 0.85;
    max-width: 300px; margin-top: 16px; line-height: 1.4;
  }
  .size-poster .ps-signup {
    margin-top: auto; width: 326px; max-width: 326px;
  }
  .size-poster .ps-signup-h {
    font-size: 42px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 2px; margin-bottom: 28px; line-height: 0.95;
  }
  .size-poster .ps-step {
    display: flex; align-items: center; gap: 18px;
    margin-bottom: 22px; font-size: 24px; font-weight: 500; line-height: 1.3;
  }
  .size-poster .ps-step .text { flex: 1; min-width: 0; }
  .size-poster .ps-cb {
    width: 32px; height: 32px; border: 3px solid var(--ink);
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
    color: var(--ink-soft); letter-spacing: 2.5px; z-index: 3;
  }
  .size-poster .ps-powered strong { color: var(--ink); }

  /* ============================
   *  DUMMY LOYALTY CARD (shared by pamphlet + poster)
   *  A preview of the card the customer actually gets — replaces the
   *  old phone mockup. Brand-coloured, with the square / circle / cross
   *  stamp motif.
   * ============================ */
  .dummy-card {
    background: __CARD_BG__; color: __CARD_INK__;
    border-radius: 22px; padding: 22px 24px; width: 100%;
    box-sizing: border-box;
    box-shadow: 0 16px 40px rgba(0,0,0,0.18);
    border: 1px solid rgba(0,0,0,0.07);
    display: flex; flex-direction: column; gap: 18px;
  }
  .dummy-card .dc-top {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
  }
  .dummy-card .dc-name {
    display: flex; align-items: center; gap: 9px;
    font-size: 19px; font-weight: 800; letter-spacing: 0.2px; line-height: 1.1;
  }
  .dummy-card .dc-sl { text-align: right; line-height: 1; flex-shrink: 0; }
  .dummy-card .dc-sl span {
    display: block; font-size: 9px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; opacity: 0.6; margin-bottom: 4px; white-space: nowrap;
  }
  .dummy-card .dc-sl b { font-size: 26px; font-weight: 800; }
  .dummy-card .dc-stamps {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 12px; justify-items: center; padding: 2px 0;
  }
  .dummy-card .dc-shape { width: 36px; height: 36px; }
  .dummy-card .dc-shape.sq { background: currentColor; border-radius: 7px; }
  .dummy-card .dc-shape.ci { background: currentColor; border-radius: 50%; }
  .dummy-card .dc-shape.cx { display: flex; }
  .dummy-card .dc-shape.cx svg { width: 100%; height: 100%; }
  .dummy-card .dc-shape.cx svg line { stroke: currentColor; stroke-width: 7; stroke-linecap: round; }
  .dummy-card .dc-shape.off { opacity: 0.22; }
  .dummy-card .dc-bottom { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; }
  .dummy-card .dc-field span {
    display: block; font-size: 9px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; opacity: 0.6; margin-bottom: 3px;
  }
  .dummy-card .dc-field b { font-size: 15px; font-weight: 700; line-height: 1.2; }
  .dummy-card .dc-reward { text-align: right; max-width: 62%; }
  .size-pamphlet .dummy-card { max-width: 358px; }

  /* Right-hand rail on the poster: dummy card on top, scan QR below. */
  .size-poster .ps-rail {
    position: absolute; right: 44px; top: 312px; bottom: 58px; width: 326px;
    display: flex; flex-direction: column; align-items: center;
    justify-content: space-between; z-index: 7;
  }

  /* ============================
   *  PROMINENT "SCAN TO JOIN" CALL-TO-ACTION
   *  The obvious scan target on the pamphlet + poster. (The in-phone
   *  QR was only 76px and read as part of the card illustration.)
   *  A white card on the coloured background with a yellow-framed QR
   *  so it's unmistakably the thing to scan.
   * ============================ */
  /* "Scan to join" — just the QR itself (no card, border or labels). */
  .scan-cta { display: flex; justify-content: center; }
  .scan-cta img { display: block; width: 168px; height: 168px; }
  .size-poster .scan-cta img { width: 196px; height: 196px; }
  /* ===== Instagram square post (1080x1080) ===== */
  @page instagram { size: 210mm 210mm; margin: 0; }
  .size-instagram {
    width: 1080px; height: 1080px; margin: 30px auto; background: __CARD_BG__; color: __CARD_INK__;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    padding: 84px 70px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); overflow: hidden;
  }
  .size-instagram .ig-biz { font-size: 34px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase; opacity: 0.9; }
  .size-instagram .ig-mid { display: flex; flex-direction: column; align-items: center; gap: 44px; }
  .size-instagram .ig-headline { font-size: 132px; font-weight: 900; line-height: 0.92; letter-spacing: -3px; text-align: center; margin: 0; }
  .size-instagram .ig-qr { background: #fff; border-radius: 30px; padding: 26px; box-shadow: 0 10px 30px rgba(0,0,0,0.18); }
  .size-instagram .ig-qr img { width: 300px; height: 300px; display: block; }
  .size-instagram .ig-foot { font-size: 32px; font-weight: 600; opacity: 0.9; text-align: center; }

  /* ===== Table QR (45mm x 45mm) ===== */
  @page table { size: 45mm 45mm; margin: 0; }
  .size-table {
    width: 170px; height: 170px; margin: 30px auto; background: #fff; color: __INK__;
    border: 4px solid __CARD_BG__; border-radius: 14px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); overflow: hidden;
  }
  .size-table .tb-qr img { width: 106px; height: 106px; display: block; }
  .size-table .tb-label { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-top: 5px; }
  .size-table .tb-biz { font-size: 7px; opacity: 0.7; margin-top: 1px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* ===== A4 sticker sheet: table QR repeated in a grid ===== */
  @page sticker { size: A4 portrait; margin: 0; }
  .size-sticker {
    width: 794px; height: 1123px; margin: 30px auto; background: #fff; color: __INK__;
    padding: 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
    align-content: start; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  }
  .size-sticker .st-cell {
    border: 3px solid __CARD_BG__; border-radius: 12px; aspect-ratio: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px;
  }
  .size-sticker .st-cell img { width: 74%; height: auto; display: block; }
  .size-sticker .st-cell span { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-top: 5px; color: #1A1A1A; }
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
        <div class="bc-noapp">No app to download</div>
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
    <div class="bc-powered">POWERED BY __BRAND_MARK__<strong>STAMPFIX.APP</strong></div>
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
          <div class="pm-step"><div class="pm-cb"></div><div class="text">Save card to Apple or Google Wallet</div></div>
          <div class="pm-step"><div class="pm-stepi">__ICON__</div><div class="text">Enjoy!</div></div>
        </div>
      </div>
    </div>
    <div class="pm-right">
      <div class="dummy-card">
        <div class="dc-top">
          <div class="dc-name">__CARD_MARK__<span>__BUSINESS_NAME_RAW__</span></div>
          <div class="dc-sl"><span>Stamps left</span><b>2</b></div>
        </div>
        <div class="dc-stamps">__DUMMY_STAMPS__</div>
        <div class="dc-bottom">
          <div class="dc-field"><span>Member</span><b>Alex</b></div>
          <div class="dc-field dc-reward"><span>Reward</span><b>__OFFER_TITLE__</b></div>
        </div>
      </div>
      <div class="scan-cta"><img src="__QR_URL__" alt="Scan to join" /></div>
      <div class="pm-starburst">
        <div class="pm-starburst-inner">__STARBURST__</div>
      </div>
    </div>
    <div class="pm-powered">POWERED BY __BRAND_MARK__<strong>STAMPFIX.APP</strong></div>
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
        <div class="ps-step"><div class="ps-cb"></div><div class="text">Save card to Apple or Google Wallet</div></div>
        <div class="ps-step"><div class="ps-stepi">__ICON__</div><div class="text">Enjoy your reward!</div></div>
      </div>
    </div>
    <div class="ps-starburst">
      <div class="ps-starburst-inner">__STARBURST__</div>
    </div>
    <div class="ps-rail">
      <div class="dummy-card">
        <div class="dc-top">
          <div class="dc-name">__CARD_MARK__<span>__BUSINESS_NAME_RAW__</span></div>
          <div class="dc-sl"><span>Stamps left</span><b>2</b></div>
        </div>
        <div class="dc-stamps">__DUMMY_STAMPS__</div>
        <div class="dc-bottom">
          <div class="dc-field"><span>Member</span><b>Alex</b></div>
          <div class="dc-field dc-reward"><span>Reward</span><b>__OFFER_TITLE__</b></div>
        </div>
      </div>
      <div class="scan-cta"><img src="__QR_URL__" alt="Scan to join" /></div>
    </div>
    <div class="ps-powered">POWERED BY __BRAND_MARK__<strong>STAMPFIX.APP</strong></div>
  </div>

  <!-- ============= INSTAGRAM SQUARE ============= -->
  <div class="size-instagram">
    <div class="ig-biz">__BUSINESS_NAME__</div>
    <div class="ig-mid">
      <h1 class="ig-headline">SCAN<br>&amp; WIN</h1>
      <div class="ig-qr"><img src="__QR_URL__" alt="Scan to join" /></div>
    </div>
    <div class="ig-foot">Rewards every visit — no app to download.</div>
  </div>

  <!-- ============= TABLE QR (45mm) ============= -->
  <div class="size-table">
    <div class="tb-qr"><img src="__QR_URL__" alt="Scan to join" /></div>
    <div class="tb-label">Scan to join</div>
    <div class="tb-biz">__BUSINESS_NAME__</div>
  </div>

  <!-- ============= A4 STICKER SHEET ============= -->
  <div class="size-sticker">__STICKER_CELLS__</div>

<script>
  // Hide non-selected size formats based on body[data-size]. This lets
  // the merchant print just the size they downloaded.
  (function() {
    var size = document.body.dataset.size || 'poster';
    var validSizes = ['card', 'pamphlet', 'poster', 'instagram', 'table', 'sticker'];
    if (!validSizes.includes(size)) size = 'poster';
    var sel = '.size-' + size;
    document.querySelectorAll('.size-card, .size-pamphlet, .size-poster, .size-instagram, .size-table, .size-sticker').forEach(function(el) {
      if (!el.matches(sel)) el.style.display = 'none';
    });
    // Use the right @page rule on print so paper size matches.
    var style = document.createElement('style');
    style.textContent = '@page { size: ' + (
      size === 'card' ? '85mm 55mm'
      : size === 'pamphlet' ? 'A5 landscape'
      : size === 'instagram' ? '210mm 210mm'
      : size === 'table' ? '45mm 45mm'
      : size === 'sticker' ? 'A4 portrait'
      : 'A4 portrait'
    ) + '; margin: 0; }';
    document.head.appendChild(style);
  })();
</script>
</body>
</html>`;
