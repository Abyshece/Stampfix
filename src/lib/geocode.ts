/**
 * Free geocoding via OpenStreetMap Nominatim (no API key, no billing).
 * Turns a merchant's address into coordinates for wallet geo-notifications.
 * Intended for low-volume use (called only when a merchant saves an address),
 * per Nominatim's usage policy. Returns null on any failure so a save never
 * breaks just because geocoding didn't resolve.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit?.lat || !hit?.lon) return null;
    const latitude = parseFloat(hit.lat);
    const longitude = parseFloat(hit.lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}
