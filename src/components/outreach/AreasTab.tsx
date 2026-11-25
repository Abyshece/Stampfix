import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, MapPin, Mail, Instagram, MessageCircle } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { inputCls } from '../addonsUi';
import { getCoverage, INDUSTRIES, countryName, type CoverageRow } from '../../lib/outreach';
import { CATEGORIES } from '../../../supabase/functions/outreach-tools/lib';
import { flag, errorText } from './common';

type Show = 'all' | 'reached' | 'not_reached';

// "cafés" (how an imported shop's kind is written) -> "cafe", for the icon.
const KEY_BY_PLURAL = new Map(Object.entries(CATEGORIES).map(([k, c]) => [c.plural.toLowerCase(), k]));
const ICON = new Map(INDUSTRIES.map((i) => [i.key, i.icon]));
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type City = {
  key: string; country: string; city: string | null; region: string | null; rows: CoverageRow[];
  shops: number; reached: number; emailed: number; ig: number; replied: number; last: string | null;
};

/**
 * Admin > Outreach > Areas: every city in the list with the kinds of shop
 * found there and how far outreach got (emailed, Instagram, replies), so
 * it's clear where you've already reached out and what's still open.
 */
export function AreasTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<CoverageRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<Show>('all');

  useEffect(() => {
    getCoverage().then(setRows).catch((e) => { toast.error(errorText(e)); setRows([]); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const kindKey = (r: CoverageRow) => (ICON.has(r.category_key) ? r.category_key : KEY_BY_PLURAL.get((r.category ?? '').toLowerCase()) ?? null);
  const kindLabel = (r: CoverageRow) =>
    r.category_key === 'other' && !r.category ? 'Other' : cap(r.category ?? t(`industries.${r.category_key}`, { defaultValue: r.category_key }));

  const cities = useMemo<City[]>(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const byCity = new Map<string, City>();
    for (const r of rows) {
      const key = `${r.country}|${r.city_key}`;
      const c = byCity.get(key) ?? { key, country: r.country, city: r.city, region: r.region, rows: [], shops: 0, reached: 0, emailed: 0, ig: 0, replied: 0, last: null };
      c.rows.push(r);
      c.shops += r.shops; c.reached += r.reached; c.emailed += r.emailed; c.ig += r.ig_messaged; c.replied += r.replied;
      const latest = [r.last_contact, r.last_added].filter(Boolean).sort().pop() ?? null;
      if (latest && (!c.last || latest > c.last)) c.last = latest;
      byCity.set(key, c);
    }
    return [...byCity.values()]
      .map((c) => ({
        ...c,
        rows: c.rows
          .filter((r) => show === 'all' || (show === 'reached' ? r.reached > 0 : r.reached === 0))
          .filter((r) => !q || `${c.city ?? ''} ${c.region ?? ''} ${countryName(c.country)} ${kindLabel(r)}`.toLowerCase().includes(q))
          .sort((a, b) => b.shops - a.shops),
      }))
      .filter((c) => c.rows.length)
      // Where you worked most recently first.
      .sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''));
  }, [rows, search, show]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === null) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

  const total = {
    cities: new Set(rows.map((r) => `${r.country}|${r.city_key}`)).size,
    kinds: new Set(rows.map((r) => kindKey(r) ?? r.category_key)).size,
    shops: rows.reduce((n, r) => n + r.shops, 0),
    reached: rows.reduce((n, r) => n + r.reached, 0),
    emailed: rows.reduce((n, r) => n + r.emailed, 0),
    ig: rows.reduce((n, r) => n + r.ig_messaged, 0),
    replied: rows.reduce((n, r) => n + r.replied, 0),
  };

  if (!rows.length) {
    return <div className="rounded-xl border notion-border bg-white p-8 text-center text-sm text-gray-500">No shops yet. Find some under “Find shops”, and this shows where you’ve reached out.</div>;
  }

  return (
    <div className="space-y-4" data-areas-tab>
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <h3 className="font-semibold text-[#37352F]">Where you’ve reached out</h3>
        <p className="text-sm text-gray-500 mt-0.5">Every city in your list, the kinds of shop you found there, and how many you’ve emailed or messaged on Instagram.</p>
        <dl className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
          {([['Cities', total.cities], ['Kinds of shop', total.kinds], ['Shops', total.shops], ['Reached', total.reached], ['Emailed', total.emailed], ['Replies', total.replied]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd className="text-lg font-semibold text-[#37352F] tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </section>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9`} placeholder="Search a city or kind of shop" data-areas-search />
        </div>
        <select value={show} onChange={(e) => setShow(e.target.value as Show)} className="border notion-border rounded-lg px-2.5 py-2 text-sm bg-white" data-areas-show>
          <option value="all">All</option>
          <option value="reached">Reached out</option>
          <option value="not_reached">Not reached out yet</option>
        </select>
      </div>

      {cities.length === 0 && (
        <div className="rounded-xl border notion-border bg-white p-8 text-center text-sm text-gray-500">Nothing matches that.</div>
      )}

      {cities.map((c) => {
        const keys = new Set(c.rows.map(kindKey).filter(Boolean));
        const missing = show === 'all' && !search ? INDUSTRIES.filter((i) => !keys.has(i.key)) : [];
        return (
          <section key={c.key} className="rounded-xl border notion-border bg-white overflow-hidden" data-area={c.city ?? '(no city)'}>
            <header className="px-4 py-3 bg-[#FBFBFA] border-b notion-border flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-[#37352F] flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  {c.city ?? 'No city'}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{[c.region, `${flag(c.country)} ${countryName(c.country)}`].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                <span><b className="text-[#37352F]">{c.shops}</b> shop{c.shops === 1 ? '' : 's'}</span>
                <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-gray-400" /><b className="text-[#37352F]">{c.emailed}</b> emailed</span>
                <span className="inline-flex items-center gap-1"><Instagram className="w-3.5 h-3.5 text-gray-400" /><b className="text-[#37352F]">{c.ig}</b> on Instagram</span>
                {c.replied > 0 && <span className="inline-flex items-center gap-1 text-green-700"><MessageCircle className="w-3.5 h-3.5" /><b>{c.replied}</b> replied</span>}
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Kind of shop</th>
                    <th className="px-3 py-2 text-left font-medium min-w-[150px]">Reached out</th>
                    <th className="px-3 py-2 text-right font-medium">Shops</th>
                    <th className="px-3 py-2 text-right font-medium">With email</th>
                    <th className="px-3 py-2 text-right font-medium">Emailed</th>
                    <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Queued</th>
                    <th className="px-3 py-2 text-right font-medium">Instagram</th>
                    <th className="px-3 py-2 text-right font-medium">Replies</th>
                    <th className="px-4 py-2 text-right font-medium hidden md:table-cell">Last contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {c.rows.map((r) => {
                    const pct = r.shops ? Math.round((r.reached / r.shops) * 100) : 0;
                    const icon = ICON.get(kindKey(r) ?? '');
                    return (
                      <tr key={r.category_key} data-area-row={kindLabel(r)}>
                        <td className="px-4 py-2.5 whitespace-nowrap text-[#37352F]">
                          <span className="inline-flex items-center gap-2">{icon && <span aria-hidden>{icon}</span>}{kindLabel(r)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden min-w-[60px]">
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
                        <td className="px-4 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap hidden md:table-cell">{date(r.last_contact) ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {c.city && missing.length > 0 && missing.length < INDUSTRIES.length && (
              <p className="px-4 py-2.5 border-t notion-border text-xs text-gray-500" data-area-missing>
                <span className="font-medium text-gray-600">Not in your list here yet:</span>{' '}
                {missing.map((i) => t(`industries.${i.key}`, { defaultValue: i.key })).join(', ')}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
