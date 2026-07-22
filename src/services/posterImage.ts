// Client-side PNG export for the Instagram square and the table QR sticker.
// Draws the design straight onto a canvas (no libraries). The QR comes from
// api.qrserver.com, which sends CORS headers, so the canvas stays untainted.

interface PC { id: string; businessName?: string | null; primaryColor?: string | null; posterColor?: string | null; }

const isHex = (v?: string | null): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v);
const lum = (h: string) => {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

function fields(c: PC, bg?: string | null) {
  const cardBg = isHex(bg) ? bg : isHex(c.primaryColor) ? c.primaryColor : isHex(c.posterColor) ? c.posterColor : '#f0ece1';
  const ink = lum(cardBg) > 150 ? '#26314D' : '#FFFFFF';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://stampfix.app';
  const joinUrl = `${origin}/?campaign=${encodeURIComponent(c.id)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&data=${encodeURIComponent(joinUrl)}`;
  return { cardBg, ink, name: c.businessName || 'Your Business', qrUrl };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stampfix';

const loadImg = (url: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('qr')); i.src = url; });

function rr(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}

function dl(cv: HTMLCanvasElement, filename: string) {
  cv.toBlob((b) => {
    if (!b) { alert('Export failed — please try again.'); return; }
    const u = URL.createObjectURL(b); const a = document.createElement('a');
    a.href = u; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
  }, 'image/png');
}

export async function downloadInstagramPng(c: PC, bg?: string | null) {
  const f = fields(c, bg);
  let qr: HTMLImageElement;
  try { qr = await loadImg(f.qrUrl); } catch { alert('Could not load the QR code. Check your connection and try again.'); return; }
  const S = 1080, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const x = cv.getContext('2d')!;
  x.fillStyle = f.cardBg; x.fillRect(0, 0, S, S);
  x.textAlign = 'center'; x.fillStyle = f.ink;
  x.font = '800 34px "Helvetica Neue", Arial, sans-serif'; (x as unknown as { letterSpacing: string }).letterSpacing = '4px';
  x.fillText(f.name.toUpperCase().slice(0, 30), S / 2, 128);
  (x as unknown as { letterSpacing: string }).letterSpacing = '0px';
  x.font = '900 138px "Helvetica Neue", Arial, sans-serif';
  x.fillText('SCAN', S / 2, 350); x.fillText('& WIN', S / 2, 484);
  const q = 340, qx = (S - q) / 2, qy = 556;
  x.fillStyle = '#fff'; rr(x, qx - 26, qy - 26, q + 52, q + 52, 30); x.fill();
  x.drawImage(qr, qx, qy, q, q);
  x.fillStyle = f.ink; x.font = '600 32px "Helvetica Neue", Arial, sans-serif';
  x.fillText('Rewards every visit — no app to download.', S / 2, 1006);
  dl(cv, `${slug(f.name)}-instagram.png`);
}

export async function downloadTableQrPng(c: PC, bg?: string | null) {
  const f = fields(c, bg);
  let qr: HTMLImageElement;
  try { qr = await loadImg(f.qrUrl); } catch { alert('Could not load the QR code. Check your connection and try again.'); return; }
  const S = 900, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#fff'; rr(x, 0, 0, S, S, 60); x.fill();
  x.lineWidth = 30; x.strokeStyle = f.cardBg; rr(x, 15, 15, S - 30, S - 30, 48); x.stroke();
  const q = 520, qx = (S - q) / 2, qy = 150; x.drawImage(qr, qx, qy, q, q);
  x.textAlign = 'center'; x.fillStyle = '#1A1A1A';
  x.font = '800 46px "Helvetica Neue", Arial, sans-serif'; (x as unknown as { letterSpacing: string }).letterSpacing = '3px';
  x.fillText('SCAN TO JOIN', S / 2, 748);
  (x as unknown as { letterSpacing: string }).letterSpacing = '0px';
  x.fillStyle = '#6B7280'; x.font = '400 30px "Helvetica Neue", Arial, sans-serif';
  x.fillText(f.name.slice(0, 34), S / 2, 800);
  dl(cv, `${slug(f.name)}-table-qr.png`);
}
