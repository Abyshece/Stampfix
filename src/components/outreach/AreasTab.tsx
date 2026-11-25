import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, ChevronDown, ChevronRight, Check, Mail, Instagram, MessageCircle } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { inputCls } from '../addonsUi';
import { getCoverage, INDUSTRIES, countryName, type CoverageRow } from '../../lib/outreach';
import { CATEGORIES } from '../../../supabase/functions/outreach-tools/lib';
import { flag, errorText } from './common';

// "cafés" (how an imported shop's kind is written) -> "cafe", for the icon.
const KEY_BY_PLURAL = new Map(Object.entries(CATEGORIES).map(([k, c]) => [c.plural.toLowerCase(), k]));
const ICON = new Map(INDUSTRIES.map((i) => [i.key, i.icon]));
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const kindKey = (r: CoverageRow) => (ICON.has(r.category_key) ? r.category_key : KEY_BY_PLURAL.get((r.category ?? '').toLowerCase()) ?? null);
const sum = (rows: CoverageRow[], f: (r: CoverageRow) => number) => rows.reduce((n, r) => n + f(r), 0);

type City = {
  key: string; country: string; city: string | null; region: string | null; rows: CoverageRow[];
  shops: number; withEmail: number; queued: number; reached: number; emailed: number; ig: number; replied: number;
  /** Not emailed or messaged yet. */
  open: number;
  lastContact: string | null; lastAdded: string;
};
type Country = { code: string; reached: City[]; next: City[]; shops: number; emailed: number; open: number; last: string };

/**
 * Admin > Outreach > Areas: one section per country. Inside, the cities
 * you've reached out to (a tick, how many emailed, how many still open) and
 * the cities you could reach out to next. Click a city for its kinds of
 * shop and how far outreach got with each.
 */
export function AreasTab() {
  const toast = useToast();
  const [rows, setRows] = useState<CoverageRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [openCountries, setOpenCountries] = useState<Set<string> | null>(null);
  const [openCities, setOpenCities] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCoverage().then(setRows).catch((e) => { toast.error(errorText(e)); setRows([]); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const countries = useMemo<Country[]>(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const byCity = new Map<string, City>();
    for (const r of rows) {
      const key = `${r.country}|${r.city_key}`;
      const c = byCity.get(key) ?? {
        key, country: r.country, city: r.city, region: r.region, rows: [],
        shops: 0, withEmail: 0, queued: 0, reached: 0, emailed: 0, ig: 0, replied: 0, open: 0, lastContact: null, lastAdded: r.last_added,
      };
      c.rows.push(r);
      c.shops += r.shops; c.withEmail += r.with_email; c.queued += r.queued; c.reached += r.reached;
      c.emailed += r.emailed; c.ig += r.ig_messaged; c.replied += r.replied;
      if (r.last_contact && (!c.lastContact || r.last_contact > c.lastContact)) c.lastContact = r.last_contact;
      if (r.last_added > c.lastAdded) c.lastAdded = r.last_added;
      byCity.set(key, c);
    }
    const byCountry = new Map<string, City[]>();
    for (const c of byCity.values()) {
      c.open = c.shops - c.reached;
      c.rows.sort((a, b) => b.shops - a.shops);
      const hay = `${c.city ?? ''} ${c.region ?? ''} ${countryName(c.country)} ${c.country}`.toLowerCase();
      if (q && !hay.includes(q)) continue;
      byCountry.set(c.country, [...(byCountry.get(c.country) ?? []), c]);
    }
    return [...byCountry.entries()].map(([code, cities]) => ({
      code,
      // Reached: most recent contact first. Next: the most shops with an address first.
      reached: cities.filter((c) => c.reached > 0).sort((a, b) => (b.lastContact ?? '').localeCompare(a.lastContact ?? '')),
      next: cities.filter((c) => c.reached === 0).sort((a, b) => b.withEmail - a.withEmail || b.shops - a.shops),
      shops: cities.reduce((n, c) => n + c.shops, 0),
      emailed: cities.reduce((n, c) => n + c.emailed, 0),
      open: cities.reduce((n, c) => n + c.open, 0),
      last: cities.map((c) => c.lastContact ?? c.lastAdded).sort().pop() ?? '',
    })).sort((a, b) => b.last.localeCompare(a.last));
  }, [rows, search]);

  // The country you worked in last starts open.
  useEffect(() => {
    if (openCountries === null && countries.length) setOpenCountries(new Set([countries[0].code]));
  }, [countries, openCountries]);

  if (rows === null) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  if (!rows.length) {
    return <div className="rounded-xl border notion-border bg-white p-8 text-center text-sm text-gray-500">No shops yet. Find some under “Find shops”, and this shows where you’ve reached out.</div>;
  }

  const cityKeys = new Set(rows.map((r) => `${r.country}|${r.city_key}`));
  const reachedCities = new Set(rows.filter((r) => r.reached > 0).map((r) => `${r.country}|${r.city_key}`));
  const total = {
    countries: new Set(rows.map((r) => r.country)).size,
    reached: reachedCities.size,
    next: cityKeys.size - reachedCities.size,
    emailed: sum(rows, (r) => r.emailed),
    open: sum(rows, (r) => r.shops - r.reached),
    replied: sum(rows, (r) => r.replied),
  };
  const toggle = (set: Set<string>, key: string) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; };
  // While searching, every matching country is open.
  const isOpen = (code: string) => !!search.trim() || (openCountries?.has(code) ?? false);

  return (
    <div className="space-y-4" data-areas-tab>
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <h3 className="font-semibold text-[#37352F]">Where you’ve reached out</h3>
        <p className="text-sm text-gray-500 mt-0.5">By country: the cities you’ve reached out to, and the ones still to go. Click a city for its kinds of shop.</p>
        <dl className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
          {([['Countries', total.countries], ['Cities reached', total.reached], ['Cities to go', total.next], ['Emailed', total.emailed], ['Still open', total.open], ['Replies', total.replied]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd className="text-lg font-semibold text-[#37352F] tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </section>

      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9`} placeholder="Search a city or country" data-areas-search />
      </div>

      {countries.length === 0 && (
        <div className="rounded-xl border notion-border bg-white p-8 text-center text-sm text-gray-500">Nothing matches that.</div>
      )}

      {countries.map((co) => {
        const open = isOpen(co.code);
        return (
          <section key={co.code} className="rounded-xl border notion-border bg-white overflow-hidden" data-country={co.code}>
            <button type="button" onClick={() => setOpenCountries((s) => toggle(s ?? new Set(), co.code))} aria-expanded={open} data-country-toggle
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-[#FBFBFA]">
              <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition ${open ? '' : '-rotate-90'}`} />
              <span className="text-lg leading-none" aria-hidden>{flag(co.code)}</span>
              <span className="font-semibold text-[#37352F] flex-1 min-w-0 truncate">{countryName(co.code)}</span>
              <span className="text-xs text-gray-500 text-right shrink-0">
                <b className="text-[#37352F]">{co.reached.length}</b> reached · <b className="text-[#37352F]">{co.next.length}</b> to go
                <span className="hidden sm:inline"> · {co.emailed} emailed · {co.open} open</span>
              </span>
            </button>

            {open && (
              <div className="border-t notion-border">
                <CityGroup title="Cities reached" count={co.reached.length} cities={co.reached} reached openCities={openCities}
                  onToggle={(k) => setOpenCities((s) => toggle(s, k))}
                  empty="None yet. Cities show up here once you email or message a shop there." />
                <CityGroup title="Cities you could reach out to next" count={co.next.length} cities={co.next} reached={false} openCities={openCities}
                  onToggle={(k) => setOpenCities((s) => toggle(s, k))}
                  empty="You’ve reached out in every city in your list. Find shops in a new city under “Find shops”." />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CityGroup({ title, count, cities, reached, openCities, onToggle, empty }: {
  title: string; count: number; cities: City[]; reached: boolean; openCities: Set<string>; onToggle: (key: string) => void; empty: string;
}) {
  return (
    <div data-city-group={reached ? 'reached' : 'next'}>
      <div className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{title} <span className="text-gray-400 font-normal">({count})</span></div>
      {cities.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-gray-400">{empty}</p>
      ) : (
        <ul className="pb-1.5">
          {cities.map((c) => {
            const open = openCities.has(c.key);
            return (
              <li key={c.key} data-area={c.city ?? '(no city)'}>
                <button type="button" onClick={() => onToggle(c.key)} aria-expanded={open} data-city-toggle
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition ${open ? 'bg-[#F7F7F5]' : 'hover:bg-[#FBFBFA]'}`}>
                  {reached
                    ? <span className="w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0" aria-label="Reached"><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>
                    : <span className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" aria-label="Not reached yet" />}
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-[#37352F] break-words">{c.city ?? 'No city'}</span>
                    {c.region && <span className="block sm:inline text-xs text-gray-500"><span className="hidden sm:inline"> · </span>{c.region}</span>}
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap justify-end shrink-0 text-xs" data-city-counts>
                    {reached ? (<>
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5"><Mail className="w-3 h-3" />{c.emailed} emailed</span>
                      {c.ig > 0 && <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-pink-50 text-pink-700 px-2 py-0.5"><Instagram className="w-3 h-3" />{c.ig}</span>}
                      <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{c.open} open</span>
                      {c.replied > 0 && <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2 py-0.5"><MessageCircle className="w-3 h-3" />{c.replied}</span>}
                    </>) : (<>
                      <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{c.shops} shop{c.shops === 1 ? '' : 's'}</span>
                      <span className="hidden sm:inline rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{c.withEmail} with email</span>
                      {c.queued > 0 && <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5">{c.queued} queued</span>}
                    </>)}
                  </span>
                  <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 transition ${open ? 'rotate-90' : ''}`} />
                </button>
                {open && <CityDetail city={c} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A city's kinds of shop and how far outreach got with each. */
function CityDetail({ city: c }: { city: City }) {
  const { t } = useTranslation();
  const label = (r: CoverageRow) =>
    r.category_key === 'other' && !r.category ? 'Other' : cap(r.category ?? t(`industries.${r.category_key}`, { defaultValue: r.category_key }));
  const keys = new Set(c.rows.map(kindKey).filter(Boolean));
  const missing = INDUSTRIES.filter((i) => !keys.has(i.key));
  return (
    <div className="mx-3 sm:mx-4 mb-3 mt-1 rounded-lg border notion-border overflow-hidden" data-city-detail>
      <div className="px-3 py-2 bg-[#FBFBFA] border-b notion-border flex items-center gap-3 flex-wrap text-xs text-gray-600">
        <span><b className="text-[#37352F]">{c.shops}</b> shop{c.shops === 1 ? '' : 's'}</span>
        <span><b className="text-[#37352F]">{c.withEmail}</b> with email</span>
        <span><b className="text-[#37352F]">{c.emailed}</b> emailed</span>
        <span><b className="text-[#37352F]">{c.ig}</b> on Instagram</span>
        {c.queued > 0 && <span><b className="text-[#37352F]">{c.queued}</b> queued</span>}
        {c.replied > 0 && <span className="text-green-700"><b>{c.replied}</b> replied</span>}
        {c.lastContact && <span className="ml-auto text-gray-500">Last contact {date(c.lastContact)}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Kind of shop</th>
              <th className="px-3 py-2 text-left font-medium min-w-[140px]">Reached out</th>
              <th className="px-3 py-2 text-right font-medium">Shops</th>
              <th className="px-3 py-2 text-right font-medium">With email</th>
              <th className="px-3 py-2 text-right font-medium">Emailed</th>
              <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Queued</th>
              <th className="px-3 py-2 text-right font-medium">Instagram</th>
              <th className="px-3 py-2 text-right font-medium">Replies</th>
              <th className="px-3 py-2 text-right font-medium hidden md:table-cell">Last contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {c.rows.map((r) => {
              const pct = r.shops ? Math.round((r.reached / r.shops) * 100) : 0;
              const icon = ICON.get(kindKey(r) ?? '');
              return (
                <tr key={r.category_key} data-area-row={label(r)}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[#37352F]">
                    <span className="inline-flex items-center gap-2">{icon && <span aria-hidden>{icon}</span>}{label(r)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden min-w-[50px]">
                        <div className={`h-full ${r.reached ? 'bg-green-600' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`text-xs tabular-nums whitespace-nowrap ${r.reached ? 'text-[#37352F]' : 'text-gray-400'}`}>
                        {r.reached ? `${r.reached} of ${r.shops}` : 'Not yet'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.shops}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.with_email}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.emailed || <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums hidden sm:table-cell">{r.queued || <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.ig_messaged || <span className="text-gray-300">0</span>}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${r.replied ? 'text-green-700 font-medium' : ''}`}>{r.replied || <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap hidden md:table-cell">{date(r.last_contact) ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {c.city && missing.length > 0 && missing.length < INDUSTRIES.length && (
        <p className="px-3 py-2.5 border-t notion-border text-xs text-gray-500" data-area-missing>
          <span className="font-medium text-gray-600">Not in your list here yet:</span>{' '}
          {missing.map((i) => t(`industries.${i.key}`, { defaultValue: i.key })).join(', ')}
        </p>
      )}
    </div>
  );
}
