/** True when a hex colour is dark enough that a dark logo/text would be low-contrast. */
export function isDarkColor(hex: string | null | undefined): boolean {
  if (!hex) return false;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum <= 150;
}

/**
 * Colour for the square/circle/cross brand mark on a card:
 *   - an explicit merchant override if set, otherwise
 *   - automatic: near-black on a light card, white on a dark card.
 */
export function effectiveLogoColor(
  logoColor: string | null | undefined,
  backgroundColor: string | null | undefined,
): string {
  return logoColor || (isDarkColor(backgroundColor) ? '#FFFFFF' : '#111827');
}
