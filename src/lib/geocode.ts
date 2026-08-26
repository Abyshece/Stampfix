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

export interface AddressHit {
  label: string;
  latitude: number;
  longitude: number;
}

/** Search OpenStreetMap (Nominatim) for matching addresses. Powers the address
 *  autocomplete so merchants pick a real place — typed addresses often fail to
 *  geocode. Low-volume use only, per Nominatim's usage policy. */
export async function searchAddresses(query: string): Promise<AddressHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
    return (Array.isArray(data) ? data : [])
      .map((d) => ({ label: d.display_name ?? '', latitude: parseFloat(d.lat ?? ''), longitude: parseFloat(d.lon ?? '') }))
      .filter((h) => h.label !== '' && !Number.isNaN(h.latitude) && !Number.isNaN(h.longitude));
  } catch {
    return [];
  }
}
