import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QRCode from 'react-qr-code';
import { UtensilsCrossed, Gift, Wifi, Star, MessageSquare, Bike, ShoppingBag, Globe, Instagram, Gamepad2, Stamp, type LucideIcon } from 'lucide-react';
import type { StickerDesign, StickerItem } from '../lib/businessPage';
import { STICKER_ITEMS } from '../lib/businessPage';
import { downloadPosterPng } from './posterImage';

/**
 * The table sticker: a small (125 x 50 mm) sticker with the Business page QR
 * code, the shop's name or logo and up to four things the page offers. One
 * HTML builder feeds the dashboard preview, the PNG and the A4 sheet, so what
 * the owner sees is what prints. Drawn at 5 px per mm.
 */

export const STICKER_W = 625;
export const STICKER_H = 250;
/** 5 px per mm x 2.4 = about 300 dpi. */
const PIXEL_RATIO = 2.4;

const ITEM_LOOK: Record<StickerItem, { icon: LucideIcon; tint: string; en: string; de: string }> = {
  menu: { icon: UtensilsCrossed, tint: '#EA580C', en: 'Menu', de: 'Speisekarte' },
  rewards: { icon: Gift, tint: '#0EA5E9', en: 'Rewards', de: 'Prämien' },
  wifi: { icon: Wifi, tint: '#16A34A', en: 'Wi-Fi', de: 'WLAN' },
  reviews: { icon: Star, tint: '#F59E0B', en: 'Reviews', de: 'Bewerten' },
  feedback: { icon: MessageSquare, tint: '#2563EB', en: 'Feedback', de: 'Feedback' },
  delivery: { icon: Bike, tint: '#0D9488', en: 'Delivery', de: 'Lieferung' },
  order: { icon: ShoppingBag, tint: '#EA580C', en: 'Order', de: 'Bestellen' },
  website: { icon: Globe, tint: '#4F46E5', en: 'Website', de: 'Website' },
  instagram: { icon: Instagram, tint: '#DD2A7B', en: 'Instagram', de: 'Instagram' },
  game: { icon: Gamepad2, tint: '#7C3AED', en: 'Game', de: 'Spiel' },
};

export function stickerItemLabel(item: StickerItem, lang: 'en' | 'de'): string {
  return ITEM_LOOK[item][lang];
}
export function stickerItemLook(item: StickerItem) {
  return ITEM_LOOK[item];
}

/** What the page offers right now, in the order they're picked by default. */
export function availableStickerItems(o: {
  orderingOn: boolean;
  links: Record<string, string> | null | undefined;
  wifiSsid: string | null | undefined;
  feedbackOn: boolean;
  gameOn: boolean;
}): StickerItem[] {
  const has = (k: string) => typeof o.links?.[k] === 'string' && o.links[k].trim() !== '';
  const on: Record<StickerItem, boolean> = {
    menu: o.orderingOn,
    rewards: true,
    wifi: !!o.wifiSsid?.trim(),
    reviews: has('googleReview'),
    feedback: o.feedbackOn,
    delivery: has('delivery'),
    order: has('order'),
    website: has('website'),
    instagram: has('instagram'),
    game: o.gameOn,
  };
  return STICKER_ITEMS.filter((k) => on[k]);
}

/** The items printed: the owner's choice (still offered), or the first four offered. */
export function stickerItemsShown(chosen: StickerItem[], available: StickerItem[]): StickerItem[] {
  const picked = chosen.filter((k) => available.includes(k));
  return (picked.length > 0 ? picked : available).slice(0, 4);
}

const hexOk = (c: string | null | undefined): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim());
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface StickerInput {
  url: string;
  design: StickerDesign;
  /** The card's colour, used when the design has no colour of its own. */
  cardColor: string | null | undefined;
  businessName: string;
  /** The shop's emoji (the card icon), shown before the name when there's no logo. */
  icon: string | null | undefined;
  /** The page's profile photo or the card logo, if there is one. */
  logoUrl: string | null;
  items: StickerItem[];
  lang: 'en' | 'de';
}

/** The colour the sticker uses. */
export function stickerAccent(design: StickerDesign, cardColor: string | null | undefined): string {
  if (hexOk(design.color)) return design.color;
  if (hexOk(cardColor)) return cardColor.trim();
  return '#37352F';
}

/** Which logo layout prints, given the choice and whether there is a logo. */
export function stickerLogoMode(design: StickerDesign, logoUrl: string | null): 'name' | 'logo_name' | 'logo' {
  if (!logoUrl) return 'name';
  return design.logo === 'auto' ? 'logo_name' : design.logo;
}

const NFC = (color: string, size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round"><circle cx="5" cy="12" r="1.7" fill="${color}" stroke="none"/><path d="M7.57 8.94 A4 4 0 0 1 7.57 15.06"/><path d="M10.46 5.49 A8.5 8.5 0 0 1 10.46 18.51"/><path d="M13.36 2.04 A13 13 0 0 1 13.36 21.96"/></svg>`;
const MARK = (color: string, h: number) => `<svg viewBox="0 0 282 90" height="${h}" width="${Math.round(h * 282 / 90)}" fill="${color}"><rect x="8" y="12" width="66" height="66" rx="4"/><circle cx="140" cy="45" r="34"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)"/><rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)"/></svg>`;

/** One sticker (the element only). */
function stickerElement(s: StickerInput, extraClass = ''): string {
  const accent = stickerAccent(s.design, s.cardColor);
  const brandBg = s.design.bg === 'brand';
  const bg = brandBg ? accent : s.design.bg === 'cream' ? '#FAF7F2' : '#FFFFFF';
  const ink = brandBg ? (lum(accent) > 160 ? '#1A1A1A' : '#FFFFFF') : '#2F2A26';
  const nameInk = brandBg ? ink : accent;
  const soft = brandBg ? (ink === '#FFFFFF' ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.18)') : 'rgba(0,0,0,.12)';
  const name = (s.design.name?.trim() || s.businessName || '').slice(0, 40);
  const size = name.length <= 14 ? 30 : name.length <= 20 ? 26 : name.length <= 28 ? 21 : 18;
  const mode = stickerLogoMode(s.design, s.logoUrl);
  const logo = s.logoUrl ? esc(s.logoUrl) : '';
  const icon = s.icon && s.icon.length <= 8 ? esc(s.icon) : '';
  const brand = mode === 'logo'
    ? `<img class="lg-only" src="${logo}" alt="" crossorigin="anonymous">`
    : `<div class="word" style="color:${nameInk};font-size:${size}px">${mode === 'logo_name'
      ? `<img class="lg" src="${logo}" alt="" crossorigin="anonymous" style="width:${size + 12}px;height:${size + 12}px">`
      : icon ? `<span class="em" style="font-size:${Math.round(size * 0.8)}px">${icon}</span>` : ''}<span class="nm">${esc(name)}</span></div>`;
  const qr = renderToStaticMarkup(createElement(QRCode, { value: s.url, size: 256, level: 'M', bgColor: '#FFFFFF', fgColor: '#111111', style: { width: '100%', height: '100%', display: 'block' } }));
  const items = s.items.map((k) => {
    const look = ITEM_LOOK[k];
    const svg = renderToStaticMarkup(createElement(look.icon, { size: 18, color: look.tint, strokeWidth: 2.1 }));
    return `<div class="it" style="color:${ink}"><span class="ch" style="background:${brandBg ? '#FFFFFF' : `${look.tint}1F`}">${svg}</span><span>${esc(look[s.lang])}</span></div>`;
  }).join('');
  return `<div class="tsk ${extraClass}" style="background:${bg};color:${ink}" data-sticker-bg="${s.design.bg}">
  <div class="q">
    <div class="qr" style="${brandBg ? 'border-color:transparent' : ''}">${qr}${s.design.nfc ? `<span class="nfc" style="background:${brandBg ? '#FFFFFF' : accent};box-shadow:0 0 0 4px ${bg}">${NFC(brandBg ? accent : '#FFFFFF', 15)}</span>` : ''}</div>
    <div class="by" style="${s.design.nfc ? 'margin-top:21px' : ''}">${MARK(ink, 8)}<span>by Stampfix</span></div>
  </div>
  <span class="dv" style="background:${soft}"></span>
  <div class="r">${brand}<div class="row">${items}</div></div>
</div>`;
}

export interface StampStickerInput {
  /** The counter stamp link (with its branch). */
  url: string;
  /** The shop's sticker design: its colour, background and NFC mark are used. */
  design: StickerDesign;
  cardColor: string | null | undefined;
  businessName: string;
  lang: 'en' | 'de';
}

/** The self-serve stamp sticker: the stamp QR code, a big "Scan or tap to get your stamp". */
function stampElement(s: StampStickerInput, extraClass = ''): string {
  const accent = stickerAccent(s.design, s.cardColor);
  const brandBg = s.design.bg === 'brand';
  const bg = brandBg ? accent : s.design.bg === 'cream' ? '#FAF7F2' : '#FFFFFF';
  const ink = brandBg ? (lum(accent) > 160 ? '#1A1A1A' : '#FFFFFF') : '#2F2A26';
  const big = s.design.nfc
    ? (s.lang === 'de' ? 'Scannen oder auflegen für Ihren Stempel' : 'Scan or tap to get your stamp')
    : (s.lang === 'de' ? 'Scannen für Ihren Stempel' : 'Scan to get your stamp');
  const name = (s.design.name?.trim() || s.businessName || '').slice(0, 40);
  const qr = renderToStaticMarkup(createElement(QRCode, { value: s.url, size: 256, level: 'M', bgColor: '#FFFFFF', fgColor: '#111111', style: { width: '100%', height: '100%', display: 'block' } }));
  const stampSvg = renderToStaticMarkup(createElement(Stamp, { size: 16, color: brandBg ? accent : '#0EA5E9', strokeWidth: 2.1 }));
  return `<div class="tsk stp ${extraClass}" style="background:${bg};color:${ink}" data-sticker-bg="${s.design.bg}">
  <div class="q">
    <div class="qr" style="${brandBg ? 'border-color:transparent' : ''}">${qr}${s.design.nfc ? `<span class="nfc" style="background:${brandBg ? '#FFFFFF' : accent};box-shadow:0 0 0 4px ${bg}">${NFC(brandBg ? accent : '#FFFFFF', 15)}</span>` : ''}</div>
    <div class="by" style="${s.design.nfc ? 'margin-top:21px' : ''}">${MARK(ink, 8)}<span>Powered by Stampfix</span></div>
  </div>
  <div class="r2">
    <div class="big" style="color:${brandBg ? ink : accent}">${esc(big)}</div>
    <div class="sub"><span class="ch sm" style="background:${brandBg ? '#FFFFFF' : '#0EA5E91F'}">${stampSvg}</span><span class="nm">${esc(name)}</span></div>
  </div>
</div>`;
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{font-family:Inter,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.tsk{position:relative;width:${STICKER_W}px;height:${STICKER_H}px;border-radius:22px;display:flex;align-items:center;overflow:hidden}
.q{flex:none;display:flex;flex-direction:column;align-items:center;gap:9px;padding-left:26px}
.qr{position:relative;width:178px;height:178px;padding:10px;background:#fff;border:1.5px solid rgba(0,0,0,.1);border-radius:16px}
.qr svg{display:block}
.nfc{position:absolute;left:50%;bottom:-27px;transform:translateX(-50%);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.by{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;letter-spacing:.3px;opacity:.9}
.dv{width:1.5px;height:180px;margin:0 22px 0 24px;flex:none}
.r{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding-right:20px}
.word{display:flex;align-items:center;gap:10px;font-family:Lora,Georgia,serif;font-weight:600;letter-spacing:-.4px;line-height:1.05;max-width:100%}
.nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.em{line-height:1;flex:none}
.lg{flex:none;border-radius:10px;object-fit:cover;background:#fff}
.lg-only{display:block;max-width:300px;max-height:72px;object-fit:contain}
.row{display:flex;gap:14px;justify-content:center}
.it{display:flex;flex-direction:column;align-items:center;gap:7px;font-size:12px;font-weight:600;letter-spacing:.15px;min-width:52px;white-space:nowrap}
.ch{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px}
.r2{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:18px;padding:0 34px 0 34px}
.big{font-family:Lora,Georgia,serif;font-weight:600;font-size:35px;line-height:1.1;letter-spacing:-.6px}
.sub{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600;opacity:.8;min-width:0}
.ch.sm{width:28px;height:28px;border-radius:9px;flex:none}
.sheet{width:1050px;height:1485px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;position:relative}
.sheet .tsk{outline:1.5px dashed #C9C4BD;outline-offset:6px}
.sheet .note{position:absolute;bottom:16px;left:0;right:0;text-align:center;font-size:13px;color:#8A8178}
`;

const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@600&family=Lora:wght@600&display=swap';
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONT_CSS_URL}" rel="stylesheet">`;
/** The fonts as embedded CSS (when given), so the PNG prints with them too. */
const fontsTag = (embedded?: string) => (embedded ? `<style>${embedded}</style>` : FONTS);

/** A whole page with one sticker (preview and PNG). */
export function buildStickerHtml(s: StickerInput, embeddedFonts?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">${fontsTag(embeddedFonts)}<style>${CSS}</style></head><body>${stickerElement(s, 'size-tablesticker')}</body></html>`;
}

/** An A4 page with five stickers and cut lines, for printing at home. */
function sheetHtml(element: string, lang: 'en' | 'de', embeddedFonts?: string): string {
  const note = lang === 'de'
    ? 'Auf A4 drucken (100 %), an der gestrichelten Linie ausschneiden. Jeder Sticker: 12,5 × 5 cm.'
    : 'Print on A4 at 100%, cut along the dashed lines. Each sticker: 12.5 × 5 cm.';
  return `<!doctype html><html><head><meta charset="utf-8">${fontsTag(embeddedFonts)}<style>${CSS}</style></head><body><div class="sheet size-stickersheet">${Array.from({ length: 5 }, () => element).join('')}<div class="note">${note}</div></div></body></html>`;
}
export function buildStickerSheetHtml(s: StickerInput, embeddedFonts?: string): string {
  return sheetHtml(stickerElement(s), s.lang, embeddedFonts);
}

/** The stamp sticker: one (preview and PNG) or an A4 sheet of five. */
export function buildStampStickerHtml(s: StampStickerInput, embeddedFonts?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">${fontsTag(embeddedFonts)}<style>${CSS}</style></head><body>${stampElement(s, 'size-tablesticker')}</body></html>`;
}
export function buildStampStickerSheetHtml(s: StampStickerInput, embeddedFonts?: string): string {
  return sheetHtml(stampElement(s), s.lang, embeddedFonts);
}

const fileSlug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stampfix';

/**
 * Inter and Lora as @font-face rules with the font files inside (Latin and
 * Latin Extended only). The PNG export can't use the Google stylesheet link,
 * so the download embeds the fonts. Fetched once; '' when they can't be
 * fetched (the sticker then prints with a standard serif and sans).
 */
let fontsOnce: Promise<string> | null = null;
/** Set once the fonts are in: downloads then start right away (iPhone needs the
 *  save tab opened straight from the tap). */
let fontsReady: string | null = null;
/** Fetch the fonts ahead of a download (the designer calls this when it opens). */
export function prefetchStickerFonts(): void { void embeddedFonts(); }
function embeddedFonts(): Promise<string> {
  if (!fontsOnce) {
    fontsOnce = (async () => {
      const css = await (await fetch(FONT_CSS_URL)).text();
      const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)]
        .filter((m) => m[1] === 'latin' || m[1] === 'latin-ext').map((m) => m[2]);
      const toData = (blob: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
      const out = await Promise.all(blocks.map(async (b) => {
        const url = /url\(([^)]+)\)/.exec(b)?.[1]?.replace(/["']/g, '');
        if (!url) return '';
        const data = await toData(await (await fetch(url)).blob());
        return b.replace(/url\([^)]+\)/, `url(${data})`);
      }));
      const all = out.join('\n');
      if (!all) throw new Error('no fonts');
      fontsReady = all;
      return all;
    })().catch(() => { fontsOnce = null; return ''; });
  }
  return fontsOnce;
}

export async function downloadStickerPng(s: StickerInput, kind: 'one' | 'sheet', errorMessage?: string): Promise<void> {
  const base = fileSlug(s.design.name || s.businessName);
  const fonts = fontsReady ?? await embeddedFonts();
  if (kind === 'sheet') {
    await downloadPosterPng(buildStickerSheetHtml(s, fonts), 'stickersheet', `${base}-table-stickers-a4-${s.lang}.png`, errorMessage, PIXEL_RATIO, fonts || undefined);
  } else {
    await downloadPosterPng(buildStickerHtml(s, fonts), 'tablesticker', `${base}-table-sticker-${s.lang}.png`, errorMessage, PIXEL_RATIO, fonts || undefined);
  }
}

export async function downloadStampStickerPng(s: StampStickerInput, kind: 'one' | 'sheet', errorMessage?: string): Promise<void> {
  const base = fileSlug(s.design.name || s.businessName);
  const fonts = fontsReady ?? await embeddedFonts();
  if (kind === 'sheet') {
    await downloadPosterPng(buildStampStickerSheetHtml(s, fonts), 'stickersheet', `${base}-stamp-stickers-a4-${s.lang}.png`, errorMessage, PIXEL_RATIO, fonts || undefined);
  } else {
    await downloadPosterPng(buildStampStickerHtml(s, fonts), 'tablesticker', `${base}-stamp-sticker-${s.lang}.png`, errorMessage, PIXEL_RATIO, fonts || undefined);
  }
}
