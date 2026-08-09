import { toPng } from 'html-to-image';
// Client-side PNG export for the Instagram square and the table QR.
// Backgrounds honour the poster colour/gradient setting (same value the
// pamphlet uses); the QR comes from CORS-enabled api.qrserver.com.

interface PC { id: string; businessName?: string | null; primaryColor?: string | null; posterColor?: string | null; }

const isHex = (v?: string | null): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);
const lum = (h: string) => {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const parseGrad = (s?: string | null) => {
  const m = /linear-gradient\(\s*(-?\d+)deg\s*,\s*(#[0-9a-fA-F]{6})[^,]*,\s*(#[0-9a-fA-F]{6})/.exec(s || '');
  return m ? { angle: +m[1], from: m[2], to: m[3] } : null;
};
const inkFor = (bg: string) => {
  const g = parseGrad(bg);
  const l = g ? (lum(g.from) + lum(g.to)) / 2 : isHex(bg) ? lum(bg) : 255;
  return l > 150 ? '#1A1A1A' : '#FFFFFF';
};

function info(c: PC, bg?: string | null) {
  const posterBg = bg && (isHex(bg) || /gradient\(/i.test(bg)) ? bg : '#FFFFFF';
  const cardColor = isHex(c.primaryColor) ? c.primaryColor : isHex(c.posterColor) ? c.posterColor : '#75FBFD';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://stampfix.app';
  const joinUrl = `${origin}/?campaign=${encodeURIComponent(c.id)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&data=${encodeURIComponent(joinUrl)}`;
  return { posterBg, ink: inkFor(posterBg), cardColor, name: c.businessName || 'Your Business', qrUrl };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stampfix';
const loadImg = (url: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('qr')); i.src = url; });

function rr(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
function applyBg(x: CanvasRenderingContext2D, bg: string, w: number, h: number) {
  const g = parseGrad(bg);
  if (g) {
    const rad = g.angle * Math.PI / 180, dx = Math.sin(rad), dy = -Math.cos(rad), L = Math.hypot(w, h);
    const grad = x.createLinearGradient(w / 2 - dx * L / 2, h / 2 - dy * L / 2, w / 2 + dx * L / 2, h / 2 + dy * L / 2);
    grad.addColorStop(0, g.from); grad.addColorStop(1, g.to); x.fillStyle = grad;
  } else x.fillStyle = isHex(bg) ? bg : '#FFFFFF';
  x.fillRect(0, 0, w, h);
}
function mark(x: CanvasRenderingContext2D, X: number, Y: number, h: number, col: string) {
  const k = h / 90; x.fillStyle = col;
  rr(x, X + 8 * k, Y + 12 * k, 66 * k, 66 * k, 4 * k); x.fill();
  x.beginPath(); x.arc(X + 140 * k, Y + 45 * k, 34 * k, 0, 7); x.fill();
  x.save(); x.translate(X + 240 * k, Y + 45 * k);
  for (const a of [Math.PI / 4, -Math.PI / 4]) { x.save(); x.rotate(a); rr(x, -45 * k, -9 * k, 90 * k, 18 * k, 9 * k); x.fill(); x.restore(); }
  x.restore();
}
function peekCard(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, rot: number, bg: string) {
  const h = w * 1.42, ink = lum(isHex(bg) ? bg : '#75FBFD') > 150 ? '#1A2540' : '#FFFFFF';
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.shadowColor = 'rgba(0,0,0,0.28)'; x.shadowBlur = 40; x.shadowOffsetY = 16;
  rr(x, -w / 2, -h / 2, w, h, 26); x.fillStyle = bg; x.fill();
  x.shadowColor = 'transparent';
  mark(x, -w * 0.4, -h * 0.42, w * 0.11, ink);
  const s = w * 0.12, sp = w * 0.27, x0 = -w * 0.33, y0 = -h * 0.02;
  for (let i = 0; i < 6; i++) {
    const c = i % 3, r = Math.floor(i / 3), px = x0 + c * sp, py = y0 + r * sp;
    x.lineWidth = w * 0.024; x.strokeStyle = ink; x.fillStyle = ink;
    x.beginPath(); x.arc(px, py, s / 2, 0, 7); if (i < 3) x.fill(); else x.stroke();
  }
  x.restore();
}
function dl(cv: HTMLCanvasElement, filename: string) {
  cv.toBlob((b) => { if (!b) { alert('Export failed — please try again.'); return; }
    const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
  }, 'image/png');
}

export async function downloadInstagramPng(c: PC, bg?: string | null) {
  const f = info(c, bg);
  let qr: HTMLImageElement;
  try { qr = await loadImg(f.qrUrl); } catch { alert('Could not load the QR code. Check your connection and try again.'); return; }
  const S = 1080, cv = document.createElement('canvas'); cv.width = S; cv.height = S; const x = cv.getContext('2d')!;
  applyBg(x, f.posterBg, S, S);
  // wallet cards peeking from left and right
  peekCard(x, 30, 660, 440, -0.13, f.cardColor);
  peekCard(x, S - 30, 660, 440, 0.13, f.cardColor);
  x.textAlign = 'center'; x.fillStyle = f.ink;
  x.font = '800 32px "Helvetica Neue", Arial, sans-serif'; (x as unknown as { letterSpacing: string }).letterSpacing = '4px';
  x.fillText(f.name.toUpperCase().slice(0, 28), S / 2, 118);
  (x as unknown as { letterSpacing: string }).letterSpacing = '0px';
  x.font = '900 128px "Helvetica Neue", Arial, sans-serif';
  x.fillText('SCAN', S / 2, 320); x.fillText('& WIN', S / 2, 446);
  const q = 330, qx = (S - q) / 2, qy = 540;
  x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,0.18)'; x.shadowBlur = 30; x.shadowOffsetY = 10;
  rr(x, qx - 26, qy - 26, q + 52, q + 52, 30); x.fill(); x.shadowColor = 'transparent';
  x.drawImage(qr, qx, qy, q, q);
  x.fillStyle = f.ink; x.font = '600 32px "Helvetica Neue", Arial, sans-serif';
  x.fillText('Rewards every visit — no app to download.', S / 2, 1002);
  dl(cv, `${slug(f.name)}-instagram.png`);
}

export async function downloadTableQrPng(c: PC, bg?: string | null) {
  const f = info(c, bg);
  let qr: HTMLImageElement;
  try { qr = await loadImg(f.qrUrl); } catch { alert('Could not load the QR code. Check your connection and try again.'); return; }
  const S = 900, cv = document.createElement('canvas'); cv.width = S; cv.height = S; const x = cv.getContext('2d')!;
  applyBg(x, f.posterBg, S, S);
  x.textAlign = 'center'; x.fillStyle = f.ink;
  x.font = '800 54px "Helvetica Neue", Arial, sans-serif'; (x as unknown as { letterSpacing: string }).letterSpacing = '2px';
  x.fillText('SCAN & STAMP', S / 2, 152);
  (x as unknown as { letterSpacing: string }).letterSpacing = '0px';
  // white QR box (keeps the code scannable on any colour)
  const q = 470, qx = (S - q) / 2, qy = 214;
  x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,0.16)'; x.shadowBlur = 26; x.shadowOffsetY = 8;
  rr(x, qx - 30, qy - 30, q + 60, q + 60, 26); x.fill(); x.shadowColor = 'transparent';
  x.drawImage(qr, qx, qy, q, q);
  x.fillStyle = f.ink; x.font = '800 46px "Helvetica Neue", Arial, sans-serif'; (x as unknown as { letterSpacing: string }).letterSpacing = '1px';
  x.fillText('WIN REWARDS WITH US', S / 2, 814);
  (x as unknown as { letterSpacing: string }).letterSpacing = '0px';
  dl(cv, `${slug(f.name)}-table-qr.png`);
}

/**
 * Render a print poster (from buildPosterHtml) to a PNG and download it.
 * Uses a hidden iframe so the poster's own stylesheet applies, strips the
 * preview drop-shadow, and captures just the poster element. Fixes the odd
 * shadow that the old print-to-PDF flow produced.
 */
export async function downloadPosterPng(html: string, size: string, filename: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1600px;height:2400px;border:0;background:#fff;';
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('no iframe document');
    doc.open(); doc.write(html); doc.close();
    await new Promise((r) => setTimeout(r, 150));
    const imgs = Array.from(doc.querySelectorAll('img'));
    await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth)
      ? Promise.resolve()
      : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); })));
    try { await doc.fonts.ready; } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 100));
    const el = (doc.querySelector('.size-' + size) as HTMLElement | null) ?? doc.body;
    el.style.boxShadow = 'none';
    el.style.margin = '0';
    const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff' });
    const a = document.createElement('a');
    a.download = filename;
    a.href = dataUrl;
    a.click();
  } catch (err) {
    console.error('[poster png]', err);
    alert('Could not generate the poster image. Please try again.');
  } finally {
    setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 200);
  }
}
