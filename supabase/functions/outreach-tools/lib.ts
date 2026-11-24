// Pure helpers for the outreach-tools function (no Deno APIs, so they can be
// tested with Node): shop categories on the map, the Overpass query, turning
// map results into shops, a shop's time zone, and finding the email address
// and Instagram account a shop publishes on its own website.

export type Category = { plural: string; filters: string[] };

// The 23 kinds of shop on the landing page, as OpenStreetMap tags them.
// Each filter is one Overpass tag filter; a shop matching any of them counts.
export const CATEGORIES: Record<string, Category> = {
  cafe: { plural: 'cafés', filters: ['["amenity"="cafe"]'] },
  restaurant: { plural: 'restaurants', filters: ['["amenity"="restaurant"]'] },
  bakery: { plural: 'bakeries', filters: ['["shop"="bakery"]', '["shop"="pastry"]'] },
  iceCream: { plural: 'ice cream shops', filters: ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'] },
  snackBar: { plural: 'snack bars', filters: ['["amenity"="fast_food"]'] },
  pizzeria: { plural: 'pizzerias', filters: ['["cuisine"~"pizza"]'] },
  bar: { plural: 'bars', filters: ['["amenity"="bar"]', '["amenity"="pub"]', '["amenity"="nightclub"]'] },
  florist: { plural: 'florists', filters: ['["shop"="florist"]'] },
  nailStudio: { plural: 'nail studios', filters: ['["beauty"~"nails"]', '["shop"="beauty"]["name"~"nail",i]'] },
  hairdresser: { plural: 'hair salons', filters: ['["shop"="hairdresser"]'] },
  barbershop: { plural: 'barbershops', filters: ['["hairdresser"="barber"]', '["shop"="barber"]', '["shop"="hairdresser"]["name"~"barber",i]'] },
  tattoo: { plural: 'tattoo studios', filters: ['["shop"="tattoo"]'] },
  gym: { plural: 'gyms', filters: ['["leisure"="fitness_centre"]'] },
  retail: { plural: 'shops', filters: ['["shop"="boutique"]', '["shop"="clothes"]', '["shop"="gift"]', '["shop"="shoes"]'] },
  doner: { plural: 'döner shops', filters: ['["cuisine"~"kebab"]'] },
  bubbleTea: { plural: 'bubble tea shops', filters: ['["cuisine"~"bubble_tea"]', '["cuisine"~"juice"]', '["cuisine"~"smoothie"]'] },
  foodTruck: { plural: 'food trucks', filters: ['["street_vendor"="yes"]', '["amenity"="fast_food"]["mobile"="yes"]'] },
  lashBrow: { plural: 'lash and brow studios', filters: ['["beauty"~"lash|brow"]', '["shop"="beauty"]["name"~"lash|brow|wimper|cils",i]'] },
  spa: { plural: 'spas', filters: ['["shop"="massage"]', '["leisure"="spa"]', '["amenity"="spa"]', '["beauty"~"spa"]'] },
  carWash: { plural: 'car washes', filters: ['["amenity"="car_wash"]'] },
  dogGrooming: { plural: 'dog groomers', filters: ['["shop"="pet_grooming"]', '["shop"="pet"]["name"~"groom",i]'] },
  dryCleaner: { plural: 'dry cleaners', filters: ['["shop"="dry_cleaning"]', '["shop"="laundry"]'] },
  yoga: { plural: 'yoga studios', filters: ['["sport"~"yoga|pilates"]', '["leisure"="fitness_centre"]["name"~"yoga|pilates",i]'] },
};

export function overpassQuery(categoryKey: string, lat: number, lon: number, radiusKm: number, limit = 300): string {
  const cat = CATEGORIES[categoryKey];
  if (!cat) throw new Error('unknown_category');
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('bad_place');
  const r = Math.round(Math.min(Math.max(radiusKm, 0.5), 25) * 1000);
  const around = `(around:${r},${lat.toFixed(5)},${lon.toFixed(5)})`;
  const parts = cat.filters.map((f) => `nwr${f}["name"]${around};`).join('');
  return `[out:json][timeout:50];(${parts});out center tags ${Math.min(Math.max(limit, 1), 500)};`;
}

export type Place = { city: string | null; region: string | null; country: string; timezone: string | null };
export type FoundShop = {
  osm_ref: string; business_name: string; category_key: string; category: string;
  city: string | null; region: string | null; country: string; timezone: string | null;
  lat: number | null; lon: number | null; address: string | null; website: string | null;
  phone: string | null; email: string | null; email_source: string | null; instagram: string | null;
  chain: boolean;
};

type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export function cleanWebsite(raw: string | null | undefined): string | null {
  let s = (raw ?? '').trim().split(/[;\s]/)[0];
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

const IG_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'direct', 'about', 'developer',
  'legal', 'web', 'share', 'sharer', 'tags', 'locations', 'help', 'privacy', 'terms', 'instagram', 'ar', 'challenge']);

export function cleanInstagram(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().replace(/^.*instagram\.com\//i, '').replace(/^@/, '');
  const m = /^[A-Za-z0-9._]{1,30}/.exec(s);
  const handle = m ? m[0].replace(/\.+$/, '') : '';
  if (!handle || IG_RESERVED.has(handle.toLowerCase())) return null;
  return handle;
}

export function parseOverpass(json: { elements?: OsmElement[] }, categoryKey: string, place: Place): FoundShop[] {
  const cat = CATEGORIES[categoryKey];
  const seen = new Set<string>();
  const out: FoundShop[] = [];
  for (const el of json.elements ?? []) {
    const t = el.tags ?? {};
    const name = (t.name ?? '').trim();
    if (!name) continue;
    const ref = `${el.type}/${el.id}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const email = (t.email ?? t['contact:email'] ?? '').split(';')[0].trim().toLowerCase();
    out.push({
      osm_ref: ref,
      business_name: name.slice(0, 200),
      category_key: categoryKey,
      category: cat.plural,
      city: (t['addr:city'] ?? place.city ?? null)?.slice(0, 80) ?? null,
      region: place.region,
      country: place.country,
      timezone: place.timezone,
      lat: el.lat ?? el.center?.lat ?? null,
      lon: el.lon ?? el.center?.lon ?? null,
      address: [street, t['addr:postcode'], t['addr:city']].filter(Boolean).join(', ').slice(0, 200) || null,
      website: cleanWebsite(t.website ?? t['contact:website'] ?? t.url),
      phone: (t.phone ?? t['contact:phone'] ?? '').split(';')[0].trim().slice(0, 60) || null,
      email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
      email_source: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'map listing' : null,
      instagram: cleanInstagram(t['contact:instagram'] ?? t.instagram),
      // A chain's branches belong to a head office, not to an owner we can reach.
      chain: !!(t.brand || t['brand:wikidata']),
    });
  }
  return out;
}

// ---- Time zones ----------------------------------------------------------------

const ONE_ZONE: Record<string, string> = {
  GB: 'Europe/London', IE: 'Europe/Dublin', DE: 'Europe/Berlin', AT: 'Europe/Vienna', CH: 'Europe/Zurich',
  FR: 'Europe/Paris', BE: 'Europe/Brussels', NL: 'Europe/Amsterdam', LU: 'Europe/Luxembourg', ES: 'Europe/Madrid',
  IT: 'Europe/Rome', DK: 'Europe/Copenhagen', SE: 'Europe/Stockholm', NO: 'Europe/Oslo', FI: 'Europe/Helsinki',
  PL: 'Europe/Warsaw', CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest', RO: 'Europe/Bucharest',
  BG: 'Europe/Sofia', GR: 'Europe/Athens', HR: 'Europe/Zagreb', SI: 'Europe/Ljubljana', RS: 'Europe/Belgrade',
  TR: 'Europe/Istanbul', UA: 'Europe/Kyiv', EE: 'Europe/Tallinn', LV: 'Europe/Riga', LT: 'Europe/Vilnius',
  IS: 'Atlantic/Reykjavik', MT: 'Europe/Malta', CY: 'Asia/Nicosia', AE: 'Asia/Dubai', SA: 'Asia/Riyadh',
  QA: 'Asia/Qatar', IL: 'Asia/Jerusalem', IN: 'Asia/Kolkata', PK: 'Asia/Karachi', BD: 'Asia/Dhaka',
  LK: 'Asia/Colombo', NP: 'Asia/Kathmandu', SG: 'Asia/Singapore', MY: 'Asia/Kuala_Lumpur', TH: 'Asia/Bangkok',
  VN: 'Asia/Ho_Chi_Minh', PH: 'Asia/Manila', HK: 'Asia/Hong_Kong', TW: 'Asia/Taipei', JP: 'Asia/Tokyo',
  KR: 'Asia/Seoul', CN: 'Asia/Shanghai', NZ: 'Pacific/Auckland', ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos',
  KE: 'Africa/Nairobi', EG: 'Africa/Cairo', MA: 'Africa/Casablanca', GH: 'Africa/Accra',
  AR: 'America/Argentina/Buenos_Aires', CL: 'America/Santiago', CO: 'America/Bogota', PE: 'America/Lima',
};
const CA_ZONES: Array<[RegExp, string]> = [
  [/british columbia|^bc$/i, 'America/Vancouver'], [/alberta|^ab$/i, 'America/Edmonton'],
  [/saskatchewan|^sk$/i, 'America/Regina'], [/manitoba|^mb$/i, 'America/Winnipeg'],
  [/ontario|^on$/i, 'America/Toronto'], [/qu[eé]bec|^qc$/i, 'America/Toronto'],
  [/new brunswick|^nb$/i, 'America/Moncton'], [/nova scotia|^ns$/i, 'America/Halifax'],
  [/prince edward|^pe$/i, 'America/Halifax'], [/newfoundland|^nl$/i, 'America/St_Johns'],
  [/yukon|^yt$/i, 'America/Whitehorse'], [/northwest|^nt$/i, 'America/Yellowknife'], [/nunavut|^nu$/i, 'America/Iqaluit'],
];
const AU_ZONES: Array<[RegExp, string]> = [
  [/new south wales|capital territory|^nsw$|^act$/i, 'Australia/Sydney'], [/victoria|^vic$/i, 'Australia/Melbourne'],
  [/queensland|^qld$/i, 'Australia/Brisbane'], [/south australia|^sa$/i, 'Australia/Adelaide'],
  [/western australia|^wa$/i, 'Australia/Perth'], [/tasmania|^tas$/i, 'Australia/Hobart'],
  [/northern territory|^nt$/i, 'Australia/Darwin'],
];

/** The shop's time zone from its country, state and longitude. */
export function guessTimezone(country: string, region: string | null, lon: number): string {
  const cc = country.toUpperCase();
  const r = (region ?? '').trim();
  if (cc === 'CA') return CA_ZONES.find(([re]) => re.test(r))?.[1] ?? 'America/Toronto';
  if (cc === 'AU') return AU_ZONES.find(([re]) => re.test(r))?.[1] ?? 'Australia/Sydney';
  if (cc === 'US') {
    if (/arizona/i.test(r)) return 'America/Phoenix';
    if (/hawaii/i.test(r)) return 'Pacific/Honolulu';
    if (/alaska/i.test(r)) return 'America/Anchorage';
    if (lon > -87.5) return 'America/New_York';
    if (lon > -101) return 'America/Chicago';
    if (lon > -115) return 'America/Denver';
    return 'America/Los_Angeles';
  }
  if (ONE_ZONE[cc]) return ONE_ZONE[cc];
  // Anywhere else: the hour offset from the longitude (Etc zones count the other way).
  const h = Math.max(-12, Math.min(14, Math.round(lon / 15)));
  return h === 0 ? 'Etc/GMT' : `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
}

// ---- Reading a shop's website ----------------------------------------------------------

const JUNK_DOMAINS = /(^|\.)(example\.(com|org)|domain\.com|email\.com|yourdomain\.com|mysite\.com|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|wix\.com|godaddy\.com|squarespace\.com|shopify\.com|wordpress\.com|w3\.org|schema\.org|googleusercontent\.com|cloudflare\.com)$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&commat;/gi, '@').replace(/&period;/gi, '.').replace(/&amp;/gi, '&');
}

export function isUsableEmail(e: string): boolean {
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return false;
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e) || /@\d+x\./.test(e)) return false;
  if (/^(no-?reply|donotreply|privacy|abuse|postmaster|webmaster)@/.test(e)) return false;
  return !JUNK_DOMAINS.test(e.split('@')[1]);
}

/** Email addresses, Instagram accounts and likely contact pages on one web page. */
export function extractContacts(html: string, pageUrl: string): { emails: string[]; instagram: string[]; contactLinks: string[] } {
  const text = decodeEntities(html);
  const emails = new Set<string>();
  for (const m of text.matchAll(/mailto:([^"'?\s<>]+)/gi)) {
    try { emails.add(decodeURIComponent(m[1]).trim().toLowerCase()); } catch { /* bad escape */ }
  }
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) emails.add(m[0].toLowerCase());
  const instagram = new Set<string>();
  for (const m of text.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})/gi)) {
    const h = cleanInstagram(m[1]);
    if (h) instagram.add(h);
  }
  const contactLinks = new Set<string>();
  let origin = '';
  try { origin = new URL(pageUrl).origin; } catch { /* no links then */ }
  if (origin) {
    for (const m of text.matchAll(/href=["']([^"'#]+)["']/gi)) {
      if (!/contact|kontakt|about|impressum|reach|find-us|visit/i.test(m[1])) continue;
      try {
        const u = new URL(m[1], pageUrl);
        if (u.origin === origin && u.toString() !== pageUrl) contactLinks.add(u.toString());
      } catch { /* not a link */ }
    }
  }
  return { emails: [...emails].filter(isUsableEmail), instagram: [...instagram], contactLinks: [...contactLinks].slice(0, 5) };
}

function baseDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  return parts.slice(-2).join('.');
}

/** The best address for the owner: the shop's own domain first, then the usual inboxes. */
export function pickEmail(emails: string[], website: string | null): string | null {
  if (!emails.length) return null;
  let site = '';
  try { site = website ? baseDomain(new URL(website).hostname) : ''; } catch { /* none */ }
  const score = (e: string) => {
    const [local, domain] = e.split('@');
    let s = 0;
    if (site && baseDomain(domain) === site) s += 4;
    if (/^(info|hello|hi|contact|owner|team|office|mail|kontakt|bonjour|hola)$/.test(local)) s += 2;
    if (/^(jobs|careers|hr|press|media|events|catering|orders|reservations|booking|bookings|sales|support)$/.test(local)) s -= 1;
    return s;
  };
  return [...emails].sort((a, b) => score(b) - score(a))[0];
}

/** Only public web addresses: no local or private network hosts. */
export function isPublicUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
    if (/^\[?[0-9a-f:]+\]?$/.test(h) && h.includes(':')) return false; // IPv6 literal
    const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ip) {
      const [a, b] = [Number(ip[1]), Number(ip[2])];
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
    }
    return h.includes('.');
  } catch {
    return false;
  }
}
