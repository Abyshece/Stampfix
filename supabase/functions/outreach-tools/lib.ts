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

// ---- Geoapify (the main shop search) ------------------------------------------
//
// Geoapify serves the same OpenStreetMap shops from its own servers, which
// answer reliably (the free Overpass servers are often "at capacity"). It
// needs a key (GEOAPIFY_API_KEY, free: 3,000 searches a day). Kinds it doesn't
// list separately are found in a wider category and picked out by their tags.

type Raw = Record<string, unknown>;
const tagText = (raw: Raw, name: string) =>
  [raw.beauty, raw.sport, raw.hairdresser, raw.shop, raw.cuisine, raw.craft, raw.amenity, name]
    .filter((x) => typeof x === 'string').join(' ').toLowerCase();
const matching = (re: RegExp) => (raw: Raw, name: string) => re.test(tagText(raw, name));

export const GEOAPIFY: Record<string, { categories: string; match?: (raw: Raw, name: string) => boolean }> = {
  cafe: { categories: 'catering.cafe' },
  restaurant: { categories: 'catering.restaurant' },
  bakery: { categories: 'commercial.food_and_drink.bakery' },
  iceCream: { categories: 'catering.ice_cream,catering.cafe.ice_cream,commercial.food_and_drink.ice_cream' },
  snackBar: { categories: 'catering.fast_food' },
  pizzeria: { categories: 'catering.restaurant.pizza,catering.fast_food.pizza' },
  bar: { categories: 'catering.bar,catering.pub' },
  florist: { categories: 'commercial.florist' },
  nailStudio: { categories: 'service.beauty', match: matching(/nail/) },
  hairdresser: { categories: 'service.beauty.hairdresser' },
  barbershop: { categories: 'service.beauty.hairdresser', match: matching(/barber/) },
  tattoo: { categories: 'service.beauty.tattoo' },
  gym: { categories: 'sport.fitness.fitness_centre,sport.fitness.gym' },
  retail: { categories: 'commercial.clothing,commercial.gift_and_souvenir' },
  doner: { categories: 'catering.fast_food.kebab,catering.restaurant.kebab' },
  bubbleTea: { categories: 'catering.cafe', match: matching(/bubble|boba|juice|smoothie/) },
  foodTruck: {
    categories: 'catering.fast_food',
    match: (raw, name) => raw.street_vendor === 'yes' || raw.mobile === 'yes' || /\btrucks?\b|food ?cart|imbisswagen/.test(name.toLowerCase()),
  },
  lashBrow: { categories: 'service.beauty', match: matching(/lash|brow|wimper|cils/) },
  spa: { categories: 'service.beauty.spa,service.beauty.massage' },
  carWash: { categories: 'service.vehicle.car_wash' },
  dogGrooming: { categories: 'pet.service,commercial.pet', match: matching(/groom|hundesalon|toilettage/) },
  dryCleaner: { categories: 'service.cleaning.dry_cleaning,service.cleaning.laundry' },
  yoga: { categories: 'sport.fitness', match: matching(/yoga|pilates/) },
};

export function geoapifyUrl(categoryKey: string, lat: number, lon: number, radiusKm: number, apiKey: string): string {
  const g = GEOAPIFY[categoryKey];
  if (!g) throw new Error('unknown_category');
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('bad_place');
  const r = Math.round(Math.min(Math.max(radiusKm, 0.5), 25) * 1000);
  const q = new URLSearchParams({
    categories: g.categories,
    filter: `circle:${lon.toFixed(5)},${lat.toFixed(5)},${r}`,
    bias: `proximity:${lon.toFixed(5)},${lat.toFixed(5)}`,
    conditions: 'named',
    limit: '500',
    lang: 'en',
    apiKey,
  });
  return `https://api.geoapify.com/v2/places?${q}`;
}

const firstText = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(firstText).find(Boolean) ?? null;
  return null;
};
const OSM_TYPE: Record<string, string> = { n: 'node', w: 'way', r: 'relation', node: 'node', way: 'way', relation: 'relation' };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Geoapify's answer as shops, in the same shape as the map (Overpass) results. */
export function parseGeoapify(json: unknown, categoryKey: string, place: Place): FoundShop[] {
  const cat = CATEGORIES[categoryKey];
  const g = GEOAPIFY[categoryKey];
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!cat || !g || !Array.isArray(features)) return [];
  const seen = new Set<string>();
  const out: FoundShop[] = [];
  for (const f of features) {
    const { geometry, properties } = (f ?? {}) as { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> };
    const pr = properties ?? {};
    const raw = ((pr.datasource as { raw?: Raw } | undefined)?.raw ?? {}) as Raw;
    const name = String(pr.name ?? raw.name ?? '').trim();
    if (!name) continue;
    if (g.match && !g.match(raw, name)) continue;
    const osmType = OSM_TYPE[String(raw.osm_type ?? '')];
    const ref = osmType && raw.osm_id != null ? `${osmType}/${raw.osm_id}` : `geoapify/${String(pr.place_id ?? name)}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const contact = (pr.contact ?? {}) as Record<string, unknown>;
    const email = (firstText(contact.email) ?? firstText(raw.email) ?? firstText(raw['contact:email']) ?? '').split(';')[0].trim().toLowerCase();
    const country = String(pr.country_code ?? '').toUpperCase();
    const street = [pr.housenumber, pr.street].filter((x) => typeof x === 'string' && x).join(' ');
    const city = typeof pr.city === 'string' ? pr.city : place.city;
    const [lon, lat] = geometry?.coordinates ?? [];
    out.push({
      osm_ref: ref,
      business_name: name.slice(0, 200),
      category_key: categoryKey,
      category: cat.plural,
      city: city?.slice(0, 80) ?? null,
      region: typeof pr.state === 'string' ? pr.state : place.region,
      country: /^[A-Z]{2}$/.test(country) ? country : place.country,
      timezone: (pr.timezone as { name?: string } | undefined)?.name ?? place.timezone,
      lat: typeof pr.lat === 'number' ? pr.lat : Number.isFinite(lat) ? lat : null,
      lon: typeof pr.lon === 'number' ? pr.lon : Number.isFinite(lon) ? lon : null,
      address: [street, pr.postcode, pr.city].filter((x) => typeof x === 'string' && x).join(', ').slice(0, 200) || null,
      website: cleanWebsite(firstText(pr.website) ?? firstText(raw.website) ?? firstText(raw['contact:website']) ?? firstText(raw.url)),
      phone: (firstText(contact.phone) ?? firstText(raw.phone) ?? firstText(raw['contact:phone']) ?? '').split(';')[0].trim().slice(0, 60) || null,
      email: EMAIL_RE.test(email) ? email : null,
      email_source: EMAIL_RE.test(email) ? 'map listing' : null,
      instagram: cleanInstagram(firstText(raw['contact:instagram']) ?? firstText(raw.instagram)),
      chain: !!(pr.brand || raw.brand || raw['brand:wikidata']),
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

// ---- Places (city or neighbourhood search) -------------------------------------

export type FoundPlace = { label: string; lat: number; lon: number; country: string; region: string | null; city: string | null; timezone: string | null };

const okPlace = (p: FoundPlace) => /^[A-Z]{2}$/.test(p.country) && Number.isFinite(p.lat) && Number.isFinite(p.lon);
const dedupe = (list: FoundPlace[]) => {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true)));
};

/** Nominatim's search results as places. */
export function placesFromNominatim(rows: unknown): FoundPlace[] {
  if (!Array.isArray(rows)) return [];
  return dedupe(rows.map((r: { display_name?: string; lat?: string; lon?: string; address?: Record<string, string> }) => {
    const a = r.address ?? {};
    const country = (a.country_code ?? '').toUpperCase();
    const lat = Number(r.lat), lon = Number(r.lon);
    const region = a.state ?? a.province ?? a.region ?? a.state_district ?? null;
    return {
      label: String(r.display_name ?? ''),
      lat, lon, country, region,
      city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county ?? null,
      timezone: country ? guessTimezone(country, region, lon) : null,
    };
  }).filter((p) => p.label && okPlace(p)));
}

/** Photon's (search-as-you-type) results as places: "Kitsilano, Vancouver, British Columbia, Canada". */
export function placesFromPhoton(json: unknown): FoundPlace[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  return dedupe(features.map((f) => {
    const { geometry, properties: pr = {} } = f as { geometry?: { coordinates?: number[] }; properties?: Record<string, string> };
    const [lon, lat] = geometry?.coordinates ?? [];
    const country = String(pr.countrycode ?? '').toUpperCase();
    const region = pr.state ?? null;
    const name = pr.name ?? '';
    const city = pr.city && pr.city !== name ? pr.city : null;
    return {
      // Each part once: "Berlin, Germany", not "Berlin, Berlin, Germany".
      label: [...new Map([name, city, !city ? pr.county : null, region, pr.country]
        .filter((x): x is string => !!x).map((x) => [x.toLowerCase(), x])).values()].join(', '),
      lat: Number(lat), lon: Number(lon), country, region,
      city: city ?? (name || null),
      timezone: country ? guessTimezone(country, region, Number(lon)) : null,
    };
  }).filter((p) => p.label && okPlace(p)));
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

// ---- All cities of a country (Admin > Outreach > Areas) -------------------------------

export type CountryCity = { name: string; region: string | null; lat: number; lon: number; population: number | null; kind: 'city' | 'town' };

const toPopulation = (v: unknown): number | null => {
  const n = parseInt(String(v ?? '').replace(/[\s,.']/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Biggest first (places without a population last, by name); each name and region once. */
export function sortCities(list: CountryCity[]): CountryCity[] {
  const seen = new Set<string>();
  return list
    .filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .sort((a, b) => (b.population ?? -1) - (a.population ?? -1) || (a.kind === b.kind ? 0 : a.kind === 'city' ? -1 : 1) || a.name.localeCompare(b.name))
    .filter((c) => {
      const k = `${c.name.toLowerCase()}|${(c.region ?? '').toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** The free OpenStreetMap (Overpass) query for a country's cities and towns: the backup source. */
export function overpassCitiesQuery(country: string): string {
  if (!/^[A-Z]{2}$/.test(country)) throw new Error('bad_country');
  return `[out:json][timeout:90];area["ISO3166-1"="${country}"][admin_level=2]->.c;`
    + `(node["place"~"^(city|town)$"]["name"](area.c););out tags 3000;`;
}

/** Overpass places as cities. The region is the state or province when the map has it. */
export function parseOverpassCities(json: unknown): CountryCity[] {
  const els = (json as { elements?: Array<{ lat?: number; lon?: number; tags?: Record<string, string> }> } | null)?.elements;
  if (!Array.isArray(els)) return [];
  return sortCities(els.map((e) => {
    const t = e.tags ?? {};
    return {
      name: (t['name:en'] ?? t.name ?? '').trim(),
      region: t['is_in:state'] ?? t['is_in:province'] ?? t['addr:state'] ?? t['addr:province'] ?? null,
      lat: Number(e.lat), lon: Number(e.lon),
      population: toPopulation(t.population),
      kind: t.place === 'town' ? 'town' : 'city',
    } as CountryCity;
  }));
}

/** Geoapify places (populated_place.city / .town) as cities; with a country, only that country's. */
export function parseGeoapifyCities(json: unknown, country?: string): CountryCity[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const inCountry = (f: unknown) => {
    const cc = String(((f as { properties?: Record<string, unknown> })?.properties ?? {}).country_code ?? '');
    return !country || !cc || cc.toLowerCase() === country.toLowerCase();
  };
  return features.filter(inCountry).map((f) => {
    const { geometry, properties } = (f ?? {}) as { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> };
    const pr = properties ?? {};
    const raw = ((pr.datasource as { raw?: Raw } | undefined)?.raw ?? {}) as Raw;
    const [lon, lat] = geometry?.coordinates ?? [];
    const cats = Array.isArray(pr.categories) ? (pr.categories as unknown[]).map(String) : [];
    return {
      name: String(pr.name ?? raw['name:en'] ?? raw.name ?? '').trim(),
      region: typeof pr.state === 'string' ? pr.state : null,
      lat: typeof pr.lat === 'number' ? pr.lat : Number(lat),
      lon: typeof pr.lon === 'number' ? pr.lon : Number(lon),
      population: toPopulation(raw.population),
      kind: cats.includes('populated_place.town') || raw.place === 'town' ? 'town' : 'city',
    } as CountryCity;
  });
}

/** Geoapify geocoding: the country itself, for its boundary id. */
export function geoapifyCountryUrl(country: string, countryName: string, apiKey: string): string {
  const q = new URLSearchParams({ text: countryName, type: 'country', filter: `countrycode:${country.toLowerCase()}`, format: 'json', lang: 'en', limit: '1', apiKey });
  return `https://api.geoapify.com/v1/geocode/search?${q}`;
}

type Bbox = { lon1: number; lat1: number; lon2: number; lat2: number };

/** The country's place_id (its boundary) and its map rectangle from that answer. */
export function countryArea(json: unknown, country: string): { placeId: string | null; bbox: Bbox | null } {
  const results = (json as { results?: Array<{ place_id?: unknown; country_code?: unknown; result_type?: unknown; bbox?: Record<string, unknown> }> } | null)?.results;
  if (!Array.isArray(results)) return { placeId: null, bbox: null };
  const hit = results.find((r) => String(r.country_code ?? '').toLowerCase() === country.toLowerCase() && (r.result_type ?? 'country') === 'country');
  const b = hit?.bbox ?? {};
  const nums = [b.lon1, b.lat1, b.lon2, b.lat2].map(Number);
  return {
    placeId: typeof hit?.place_id === 'string' && hit.place_id ? hit.place_id : null,
    bbox: nums.every(Number.isFinite) ? { lon1: nums[0], lat1: nums[1], lon2: nums[2], lat2: nums[3] } : null,
  };
}

/**
 * Geoapify places of one kind (populated_place.city or .town) inside the
 * country's boundary (place:ID), or inside its map rectangle (rect), a page at a time.
 */
export function geoapifyCitiesUrl(area: { placeId: string } | { bbox: Bbox }, category: 'populated_place.city' | 'populated_place.town', offset: number, apiKey: string): string {
  const filter = 'placeId' in area ? `place:${area.placeId}`
    : `rect:${[area.bbox.lon1, area.bbox.lat1, area.bbox.lon2, area.bbox.lat2].map((n) => n.toFixed(5)).join(',')}`;
  const q = new URLSearchParams({ categories: category, filter, conditions: 'named', limit: '500', offset: String(Math.max(0, offset)), lang: 'en', apiKey });
  return `https://api.geoapify.com/v2/places?${q}`;
}
