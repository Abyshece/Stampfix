// Readable text colour for a poster background: a solid hex or a CSS
// gradient string from the poster settings.
//
// Solid colours keep the original rule (dark ink when lum > 150). For a
// gradient we pick the ink that stays most readable on its WORST colour stop
// — averaging the stops picked white for a white→black gradient, so the white
// end came out white-on-white. When even the better ink is weak somewhere (a
// gradient that runs from light to dark), `halo` asks for a soft outline so
// the text reads on both ends.

const HEX_STOP = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

/** '#abc' → '#aabbcc'; '#aabbcc' unchanged. */
export function expandHex(h: string): string {
  return h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h;
}

/** The #hex colour stops in a gradient string, normalised to 6 digits. */
export function gradientStops(bg: string): string[] {
  return (String(bg).match(HEX_STOP) ?? []).map(expandHex);
}

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

// WCAG relative luminance + contrast ratio.
const relLum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
};
const contrast = (a: string, b: string) => {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export const DARK_INK = '#1A1A1A';
export const LIGHT_INK = '#FFFFFF';

/**
 * `light` — the background is light, so use dark ink (#1A1A1A); otherwise
 * white. `halo` — the background has both light and dark areas, so add a soft
 * outline in the opposite colour.
 */
export function posterInk(bg: string): { light: boolean; halo: boolean } {
  const s = String(bg ?? '').trim();
  if (!/gradient\(/i.test(s)) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(s);
    return { light: m ? lum('#' + m[1]) > 150 : true, halo: false };
  }
  const stops = gradientStops(s);
  if (!stops.length) return { light: false, halo: false };
  const worst = (ink: string) => Math.min(...stops.map((c) => contrast(ink, c)));
  const dark = worst(DARK_INK), white = worst(LIGHT_INK);
  return { light: dark > white, halo: Math.max(dark, white) < 2.5 };
}

/** CSS text-shadow that outlines ink on a light→dark gradient. */
export function haloShadow(light: boolean): string {
  return light
    ? '0 0 2px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.85), 0 0 12px rgba(255,255,255,0.6)'
    : '0 0 2px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6), 0 0 12px rgba(0,0,0,0.4)';
}
