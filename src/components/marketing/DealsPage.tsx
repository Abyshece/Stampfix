import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, X, Ticket, LocateFixed, RotateCcw } from 'lucide-react';
import { MarketingLayout, Eyebrow, StartButton, GradientBanner } from './MarketingLayout';
import { DealCard } from '../DealCard';
import { DealDetails } from '../DealDetails';
import { listPublicDeals, getDealFilters, sampleDeals, DEAL_CATEGORIES, DEAL_TYPES, type Deal, type DealFilters, type DealSort, type DealWhen } from '../../lib/deals';

const PAGE = 24;
const RADII = [2, 5, 10, 25, 50];
type Near = { lat: number; lng: number };
type GeoError = 'denied' | 'failed' | 'unsupported';
type Query = { q: string; country: string; city: string; category: string; type: string; when: DealWhen; sort: DealSort };
const EMPTY: Query = { q: '', country: '', city: '', category: '', type: '', when: 'all', sort: 'ending' };

function readQuery(): Query {
  const p = new URLSearchParams(window.location.search);
  const when = p.get('when'); const sort = p.get('sort');
  return {
    q: p.get('q') ?? '', country: p.get('country') ?? '', city: p.get('city') ?? '', category: p.get('category') ?? '', type: p.get('type') ?? '',
    when: when === 'now' || when === 'week' || when === 'upcoming' ? when : 'all',
    sort: sort === 'newest' || sort === 'starting' ? sort : 'ending',
  };
}
function writeQuery(q: Query) {
  const p = new URLSearchParams(window.location.search);
  (['q', 'country', 'city', 'category', 'type'] as const).forEach((k) => { if (q[k]) p.set(k, q[k]); else p.delete(k); });
  if (q.when !== 'all') p.set('when', q.when); else p.delete('when');
  if (q.sort !== 'ending' && q.sort !== 'nearest') p.set('sort', q.sort); else p.delete('sort');
  const s = p.toString();
  window.history.replaceState({}, '', `/deals${s ? `?${s}` : ''}`);
}

const dealParam = () => new URLSearchParams(window.location.search).get('deal');
function setDealParam(id: string | null, push: boolean) {
  const p = new URLSearchParams(window.location.search);
  if (id) p.set('deal', id); else p.delete('deal');
  const s = p.toString();
  const url = `/deals${s ? `?${s}` : ''}`;
  if (push) window.history.pushState({ deal: id }, '', url); else window.history.replaceState({}, '', url);
}

function Chip({ on, onClick, children, data }: { on: boolean; onClick: () => void; children: React.ReactNode; data?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} data-chip={data}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-[#37352F] bg-[#37352F] text-white' : 'notion-border bg-white text-gray-600 hover:bg-[#F7F7F5]'}`}>
      {children}
    </button>
  );
}

/** stampfix.app/deals: deals from Stampfix businesses, with filters. */
export function DealsPage() {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState<Query>(() => readQuery());
  const [search, setSearch] = useState(query.q);
  const [filters, setFilters] = useState<DealFilters | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const reqId = useRef(0);
  // "Near me": the visitor's location stays in this tab only (never in the link, never saved).
  const [near, setNear] = useState<Near | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<GeoError | null>(null);
  // Deal details (also opened straight from a shared link: /deals?deal=<id>)
  const [open, setOpen] = useState<Deal | null>(null);
  const [linkGone, setLinkGone] = useState(false);
  const pushed = useRef(false);

  useEffect(() => {
    const id = dealParam();
    if (id) {
      listPublicDeals({ id, limit: 1 })
        .then((r) => { if (r.deals[0]) setOpen(r.deals[0]); else { setLinkGone(true); setDealParam(null, false); } })
        .catch(() => { setLinkGone(true); setDealParam(null, false); });
    }
    // The browser's back button closes the details.
    const onPop = () => { if (!dealParam()) { pushed.current = false; setOpen(null); } };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openDeal = (d: Deal) => { setLinkGone(false); setOpen(d); setDealParam(d.id, true); pushed.current = true; };
  const closeDeal = () => {
    setOpen(null);
    if (pushed.current) { pushed.current = false; window.history.back(); } else setDealParam(null, false);
  };

  useEffect(() => { getDealFilters().then(setFilters).catch(() => setFilters({ total: 0, countries: [], cities: [], categories: [], types: [] })); }, []);

  // Typing in the search box waits a moment before searching.
  useEffect(() => {
    const id = setTimeout(() => setQuery((q) => (q.q === search ? q : { ...q, q: search })), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    writeQuery(query);
    const id = ++reqId.current;
    setError(false);
    setDeals(null);
    listPublicDeals({ ...query, search: query.q, limit: PAGE, offset: 0, near, radiusKm: near ? radius : null })
      .then((r) => { if (id === reqId.current) { setDeals(r.deals); setTotal(r.total); } })
      .catch(() => { if (id === reqId.current) { setDeals([]); setTotal(0); setError(true); } });
  }, [query, near, radius, retry]);

  const more = async () => {
    if (!deals) return;
    setLoadingMore(true);
    try {
      const r = await listPublicDeals({ ...query, search: query.q, limit: PAGE, offset: deals.length, near, radiusKm: near ? radius : null });
      setDeals([...deals, ...r.deals.filter((d) => !deals.some((x) => x.id === d.id))]);
      setTotal(r.total);
    } catch { setError(true); } finally { setLoadingMore(false); }
  };

  const set = (patch: Partial<Query>) => setQuery((q) => ({ ...q, ...patch }));
  const cities = useMemo(() => (filters?.cities ?? []).filter((c) => !query.country || c.country === query.country), [filters, query.country]);
  const anyFilter = !!(query.q || query.country || query.city || query.category || query.type || query.when !== 'all' || (near && radius));
  const clear = () => { setSearch(''); setRadius(null); setQuery({ ...EMPTY, sort: query.sort }); };

  const locate = () => {
    if (!('geolocation' in navigator)) { setGeoError('unsupported'); return; }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // About 100 m is plenty to sort by distance.
        setNear({ lat: Math.round(pos.coords.latitude * 1000) / 1000, lng: Math.round(pos.coords.longitude * 1000) / 1000 });
        setQuery((q) => ({ ...q, sort: 'nearest', city: '', country: '' }));
      },
      (e) => { setLocating(false); setGeoError(e.code === 1 ? 'denied' : 'failed'); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };
  const nearOff = () => { setNear(null); setRadius(null); setGeoError(null); setQuery((q) => (q.sort === 'nearest' ? { ...q, sort: 'ending' } : q)); };

  const catLabel = (k: string) => t(`industries.${k}`, { defaultValue: k === 'other' ? 'Other' : k });
  const catCount = useMemo(() => new Map((filters?.categories ?? []).map((c) => [c.key as string, c.n])), [filters]);
  const typeCount = useMemo(() => new Map((filters?.types ?? []).map((c) => [c.key as string, c.n])), [filters]);
  const allCats = useMemo(() => {
    const coll = new Intl.Collator(i18n.language || 'en');
    return [...(DEAL_CATEGORIES as readonly string[])].filter((k) => k !== 'other').sort((a, b) => coll.compare(catLabel(a), catLabel(b))).concat('other');
  }, [i18n.language]);
  const selectCls = 'rounded-lg border notion-border bg-white px-3 py-2.5 text-sm min-w-0';
  const countryName = (c: string) => { try { return new Intl.DisplayNames([i18n.language || 'en'], { type: 'region' }).of(c) ?? c; } catch { return c; } };
  const typeLabel = (k: string) => t(`deals.type.${k}`, { defaultValue: { percent: '% off', amount: 'Amount off', free: 'Free item', bogo: '2 for 1', other: 'Other' }[k] ?? k });
  const whenLabel: Record<DealWhen, string> = {
    all: t('deals.when.all', { defaultValue: 'All' }), now: t('deals.when.now', { defaultValue: 'On now' }),
    week: t('deals.when.week', { defaultValue: 'This week' }), upcoming: t('deals.when.upcoming', { defaultValue: 'Coming soon' }),
  };
  const noDealsAtAll = filters !== null && filters.total === 0 && !error;

  return (
    <MarketingLayout active="/deals">
      <section className="max-w-3xl mx-auto px-6 pt-16 md:pt-20 pb-8 text-center">
        <Eyebrow>{t('deals.page.eyebrow', { defaultValue: 'Deals' })}</Eyebrow>
        <h1 className="text-4xl md:text-6xl font-serif-display font-medium mt-6 mb-5 leading-[1.1] tracking-tight text-balance">
          {t('deals.page.h1', { defaultValue: 'Deals from local businesses near you' })}
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed text-pretty">
          {t('deals.page.sub', { defaultValue: 'Cafés, salons, gyms, shops and more. Find a deal by city and business type, then show it or its code at the counter.' })}
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-6" data-deal-filters>
        <div className="rounded-2xl border notion-border bg-white p-3 sm:p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">{t('deals.page.search', { defaultValue: 'Search deals' })}</span>
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} data-deal-search enterKeyHint="search"
                placeholder={t('deals.page.searchPh', { defaultValue: 'Search a deal, business or city' })}
                className="w-full rounded-lg border notion-border bg-[#F7F7F5] pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/10 [&::-webkit-search-cancel-button]:hidden" />
              {search && (
                <button type="button" onClick={() => { setSearch(''); set({ q: '' }); }} aria-label={t('deals.page.clearSearch', { defaultValue: 'Clear search' })} data-deal-search-clear
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-[#37352F]">
                  <X className="w-4 h-4" />
                </button>
              )}
            </label>
            {near ? (
              <button type="button" onClick={nearOff} aria-pressed data-deal-near
                className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#37352F] bg-[#37352F] text-white px-3 py-2.5 text-sm font-medium">
                <LocateFixed className="w-4 h-4" /><span>{t('deals.near.on', { defaultValue: 'Near me' })}</span><X className="w-3.5 h-3.5 opacity-70" />
              </button>
            ) : (
              <button type="button" onClick={locate} disabled={locating} aria-pressed={false} data-deal-near
                className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border notion-border bg-white px-3 py-2.5 text-sm font-medium text-[#37352F] hover:border-[#37352F] transition disabled:opacity-60">
                {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                <span>{t('deals.near.button', { defaultValue: 'Near me' })}</span>
              </button>
            )}
          </div>

          {(near || geoError) && (
            <div className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-[13px] ${geoError ? 'bg-amber-50 text-amber-800' : 'bg-[#F7F7F5] text-gray-600'}`} role={geoError ? 'alert' : 'status'} data-deal-near-note>
              <span>{geoError === 'denied'
                ? t('deals.near.denied', { defaultValue: 'Location is blocked for this site. Allow it in your browser settings, or pick a city.' })
                : geoError
                  ? t('deals.near.failed', { defaultValue: 'Could not find your location. Try again, or pick a city.' })
                  : t('deals.near.note', { defaultValue: 'Showing distances from where you are. Your location is only used for this search and is not saved.' })}</span>
              {geoError && <button type="button" onClick={() => setGeoError(null)} aria-label={t('deals.details.close', { defaultValue: 'Close' })} className="shrink-0"><X className="w-4 h-4" /></button>}
            </div>
          )}

          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
            {(filters?.countries.length ?? 0) > 1 && (
              <select value={query.country} onChange={(e) => set({ country: e.target.value, city: '' })} aria-label={t('deals.page.country', { defaultValue: 'Country' })}
                className={selectCls} data-deal-country>
                <option value="">{t('deals.page.allCountries', { defaultValue: 'All countries' })}</option>
                {filters!.countries.map((c) => <option key={c.country} value={c.country}>{countryName(c.country)} ({c.n})</option>)}
              </select>
            )}
            <select value={query.city} onChange={(e) => set({ city: e.target.value })} aria-label={t('deals.page.city', { defaultValue: 'City' })}
              className={selectCls} data-deal-city>
              <option value="">{t('deals.page.allCities', { defaultValue: 'All cities' })}</option>
              {cities.map((c) => <option key={`${c.country}-${c.city}`} value={c.city}>{c.city} ({c.n})</option>)}
            </select>
            <select value={query.category} onChange={(e) => set({ category: e.target.value })} aria-label={t('deals.page.category', { defaultValue: 'Business type' })}
              className={selectCls} data-deal-category>
              <option value="">{t('deals.page.allTypes', { defaultValue: 'All businesses' })}</option>
              {allCats.map((k) => { const n = catCount.get(k); return <option key={k} value={k}>{catLabel(k)}{n ? ` (${n})` : ''}</option>; })}
            </select>
            <select value={query.type} onChange={(e) => set({ type: e.target.value })} aria-label={t('deals.page.dealType', { defaultValue: 'Kind of deal' })}
              className={selectCls} data-deal-type>
              <option value="">{t('deals.page.allDealTypes', { defaultValue: 'All kinds of deals' })}</option>
              {DEAL_TYPES.map((k) => { const n = typeCount.get(k); return <option key={k} value={k}>{typeLabel(k)}{n ? ` (${n})` : ''}</option>; })}
            </select>
            {near && (
              <select value={radius ?? ''} onChange={(e) => setRadius(e.target.value ? Number(e.target.value) : null)} aria-label={t('deals.near.within', { defaultValue: 'Distance' })}
                className={selectCls} data-deal-radius>
                <option value="">{t('deals.near.any', { defaultValue: 'Any distance' })}</option>
                {RADII.map((r) => <option key={r} value={r}>{t('deals.near.withinKm', { defaultValue: 'Within {{n}} km', n: r })}</option>)}
              </select>
            )}
            <select value={query.sort} onChange={(e) => set({ sort: e.target.value as DealSort })} aria-label={t('deals.page.sort', { defaultValue: 'Sort' })}
              className={`${selectCls} md:ml-auto`} data-deal-sort>
              {near && <option value="nearest">{t('deals.sort.nearest', { defaultValue: 'Nearest first' })}</option>}
              <option value="ending">{t('deals.sort.ending', { defaultValue: 'Ending soon' })}</option>
              <option value="newest">{t('deals.sort.newest', { defaultValue: 'Newest' })}</option>
              <option value="starting">{t('deals.sort.starting', { defaultValue: 'Starting soon' })}</option>
            </select>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label={t('deals.page.whenLabel', { defaultValue: 'When' })}>
            {(['all', 'now', 'week', 'upcoming'] as DealWhen[]).map((w) => <Chip key={w} on={query.when === w} onClick={() => set({ when: w })} data={`when-${w}`}>{whenLabel[w]}</Chip>)}
          </div>
          {(filters?.categories.length ?? 0) > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label={t('deals.page.popular', { defaultValue: 'Popular business types' })}>
              <Chip on={!query.category} onClick={() => set({ category: '' })} data="cat-all">{t('deals.page.allTypes', { defaultValue: 'All businesses' })}</Chip>
              {filters!.categories.map((c) => (
                <Chip key={c.key} on={query.category === c.key} onClick={() => set({ category: query.category === c.key ? '' : c.key })} data={`cat-${c.key}`}>
                  {catLabel(c.key)}<span className="opacity-60 text-xs">{c.n}</span>
                </Chip>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-16" data-deal-results>
        {linkGone && (
          <p role="status" className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2 mb-4 flex items-start justify-between gap-3" data-deal-link-gone>
            <span>{t('deals.page.linkGone', { defaultValue: 'That deal has ended or is no longer listed. Here are the deals that are on.' })}</span>
            <button type="button" onClick={() => setLinkGone(false)} aria-label={t('deals.details.close', { defaultValue: 'Close' })} className="shrink-0"><X className="w-4 h-4" /></button>
          </p>
        )}
        {!noDealsAtAll && <div className="flex items-center justify-between gap-3 mb-4 min-h-[28px]">
          <p className="text-sm text-gray-500" data-deal-count>
            {deals === null ? '' : total === 1 ? t('deals.page.countOne', { defaultValue: '1 deal' }) : t('deals.page.count', { defaultValue: '{{n}} deals', n: total })}
          </p>
          {anyFilter && <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#37352F]" data-deal-clear><X className="w-3.5 h-3.5" /> {t('deals.page.clear', { defaultValue: 'Clear filters' })}</button>}
        </div>}

        {error && (
          <div role="alert" className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 mb-4 flex items-center justify-between gap-3" data-deal-error>
            <span>{t('deals.page.error', { defaultValue: 'Could not load deals. Please try again.' })}</span>
            <button type="button" onClick={() => setRetry((n) => n + 1)} className="shrink-0 inline-flex items-center gap-1 font-medium underline" data-deal-retry>
              <RotateCcw className="w-3.5 h-3.5" /> {t('deals.page.retry', { defaultValue: 'Try again' })}
            </button>
          </div>
        )}

        {deals === null ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
        ) : deals.length === 0 && error ? null : deals.length === 0 ? (
          <>
          <div className="rounded-2xl border notion-border bg-[#F7F7F5] p-10 text-center" data-deal-empty>
            <Ticket className="w-8 h-8 mx-auto text-gray-300 mb-3" />
            <h2 className="font-semibold text-lg text-[#37352F]">
              {noDealsAtAll ? t('deals.page.soonTitle', { defaultValue: 'Deals are on their way' }) : t('deals.page.noneTitle', { defaultValue: 'No deals match yet' })}
            </h2>
            <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
              {noDealsAtAll ? t('deals.page.soonBody', { defaultValue: 'Businesses are adding their first deals. Run a business? List yours for free.' })
                : near && radius ? t('deals.page.noneNear', { defaultValue: 'Nothing within {{n}} km yet. Try a bigger distance or another business type.', n: radius })
                : t('deals.page.noneBody', { defaultValue: 'Try another city or business type, or clear the filters.' })}
            </p>
            {noDealsAtAll ? <StartButton label={t('deals.page.listCta', { defaultValue: 'List your deals for free' })} className="mt-5 px-5 py-2.5" />
              : anyFilter && <button type="button" onClick={clear} className="mt-5 text-sm underline text-[#37352F]">{t('deals.page.clear', { defaultValue: 'Clear filters' })}</button>}
          </div>
          {noDealsAtAll && (
          <div className="mt-12" data-deal-examples>
            <h2 className="text-2xl md:text-3xl font-serif-display font-medium text-[#37352F] text-center">{t('deals.page.examplesTitle', { defaultValue: 'What deals look like' })}</h2>
            <p className="text-gray-500 text-center mt-2 mb-6 max-w-xl mx-auto">{t('deals.page.examplesSub', { defaultValue: 'These are examples from made-up businesses. Real deals from Stampfix businesses show here as soon as they are listed.' })}</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sampleDeals(t as unknown as (k: string, o: Record<string, unknown>) => string).map((d) => <DealCard key={d.id} deal={d} sample />)}
            </div>
          </div>
          )}
          </>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{deals.map((d) => <DealCard key={d.id} deal={d} onOpen={() => openDeal(d)} />)}</div>
            {deals.length < total && (
              <div className="text-center mt-8">
                <button type="button" onClick={() => void more()} disabled={loadingMore} data-deal-more
                  className="inline-flex items-center gap-2 rounded-lg border notion-border bg-white px-5 py-2.5 text-sm font-medium hover:border-[#37352F] transition">
                  {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} {t('deals.page.more', { defaultValue: 'Show more deals' })}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <GradientBanner
        title={t('deals.page.bannerTitle', { defaultValue: 'Own a business? List your deals here for free.' })}
        subtitle={t('deals.page.bannerSub', { defaultValue: 'Create a deal in a minute in your Stampfix dashboard. It shows here for people looking for deals in your city.' })}
        buttonLabel={t('deals.page.bannerCta', { defaultValue: 'Start your free trial' })}
      />
      {open && <DealDetails deal={open} onClose={closeDeal} />}
    </MarketingLayout>
  );
}
