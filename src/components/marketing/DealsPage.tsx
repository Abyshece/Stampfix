import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, X, Ticket } from 'lucide-react';
import { MarketingLayout, Eyebrow, StartButton, GradientBanner } from './MarketingLayout';
import { DealCard } from '../DealCard';
import { listPublicDeals, getDealFilters, sampleDeals, type Deal, type DealFilters, type DealSort, type DealWhen } from '../../lib/deals';

const PAGE = 24;
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
  if (q.sort !== 'ending') p.set('sort', q.sort); else p.delete('sort');
  const s = p.toString();
  window.history.replaceState({}, '', `/deals${s ? `?${s}` : ''}`);
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
  const reqId = useRef(0);

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
    listPublicDeals({ ...query, search: query.q, limit: PAGE, offset: 0 })
      .then((r) => { if (id === reqId.current) { setDeals(r.deals); setTotal(r.total); } })
      .catch(() => { if (id === reqId.current) { setDeals([]); setTotal(0); setError(true); } });
  }, [query]);

  const more = async () => {
    if (!deals) return;
    setLoadingMore(true);
    try {
      const r = await listPublicDeals({ ...query, search: query.q, limit: PAGE, offset: deals.length });
      setDeals([...deals, ...r.deals.filter((d) => !deals.some((x) => x.id === d.id))]);
      setTotal(r.total);
    } catch { setError(true); } finally { setLoadingMore(false); }
  };

  const set = (patch: Partial<Query>) => setQuery((q) => ({ ...q, ...patch }));
  const cities = useMemo(() => (filters?.cities ?? []).filter((c) => !query.country || c.country === query.country), [filters, query.country]);
  const anyFilter = query.q || query.country || query.city || query.category || query.type || query.when !== 'all';
  const clear = () => { setSearch(''); setQuery({ ...EMPTY, sort: query.sort }); };
  const countryName = (c: string) => { try { return new Intl.DisplayNames([i18n.language || 'en'], { type: 'region' }).of(c) ?? c; } catch { return c; } };
  const typeLabel = (k: string) => t(`deals.type.${k}`, { defaultValue: { percent: '% off', amount: 'Amount off', free: 'Free item', bogo: '2 for 1', other: 'Other' }[k] ?? k });
  const whenLabel: Record<DealWhen, string> = {
    all: t('deals.when.all', { defaultValue: 'All' }), now: t('deals.when.now', { defaultValue: 'On now' }),
    week: t('deals.when.week', { defaultValue: 'This week' }), upcoming: t('deals.when.upcoming', { defaultValue: 'Coming soon' }),
  };
  const noDealsAtAll = filters !== null && filters.total === 0;

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

      {!noDealsAtAll && <section className="max-w-6xl mx-auto px-6 pb-6" data-deal-filters>
        <div className="rounded-2xl border notion-border bg-white p-3 sm:p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <label className="relative flex-1">
              <span className="sr-only">{t('deals.page.search', { defaultValue: 'Search deals' })}</span>
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} data-deal-search
                placeholder={t('deals.page.searchPh', { defaultValue: 'Search a deal, business or city' })}
                className="w-full rounded-lg border notion-border bg-[#F7F7F5] pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/10" />
            </label>
            <div className="grid grid-cols-2 md:flex gap-2">
              {(filters?.countries.length ?? 0) > 1 && (
                <select value={query.country} onChange={(e) => set({ country: e.target.value, city: '' })} aria-label={t('deals.page.country', { defaultValue: 'Country' })}
                  className="rounded-lg border notion-border bg-white px-3 py-2.5 text-sm" data-deal-country>
                  <option value="">{t('deals.page.allCountries', { defaultValue: 'All countries' })}</option>
                  {filters!.countries.map((c) => <option key={c.country} value={c.country}>{countryName(c.country)} ({c.n})</option>)}
                </select>
              )}
              <select value={query.city} onChange={(e) => set({ city: e.target.value })} aria-label={t('deals.page.city', { defaultValue: 'City' })}
                className="rounded-lg border notion-border bg-white px-3 py-2.5 text-sm" data-deal-city>
                <option value="">{t('deals.page.allCities', { defaultValue: 'All cities' })}</option>
                {cities.map((c) => <option key={`${c.country}-${c.city}`} value={c.city}>{c.city} ({c.n})</option>)}
              </select>
              <select value={query.sort} onChange={(e) => set({ sort: e.target.value as DealSort })} aria-label={t('deals.page.sort', { defaultValue: 'Sort' })}
                className="rounded-lg border notion-border bg-white px-3 py-2.5 text-sm" data-deal-sort>
                <option value="ending">{t('deals.sort.ending', { defaultValue: 'Ending soon' })}</option>
                <option value="newest">{t('deals.sort.newest', { defaultValue: 'Newest' })}</option>
                <option value="starting">{t('deals.sort.starting', { defaultValue: 'Starting soon' })}</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label={t('deals.page.whenLabel', { defaultValue: 'When' })}>
            {(['all', 'now', 'week', 'upcoming'] as DealWhen[]).map((w) => <Chip key={w} on={query.when === w} onClick={() => set({ when: w })} data={`when-${w}`}>{whenLabel[w]}</Chip>)}
            {(filters?.types.length ?? 0) > 1 && <span className="w-px bg-gray-200 mx-1 shrink-0" aria-hidden />}
            {(filters?.types.length ?? 0) > 1 && filters!.types.map((ty) => (
              <Chip key={ty.key} on={query.type === ty.key} onClick={() => set({ type: query.type === ty.key ? '' : ty.key })} data={`type-${ty.key}`}>{typeLabel(ty.key)}</Chip>
            ))}
          </div>
          {(filters?.categories.length ?? 0) > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label={t('deals.page.category', { defaultValue: 'Business type' })}>
              <Chip on={!query.category} onClick={() => set({ category: '' })} data="cat-all">{t('deals.page.allTypes', { defaultValue: 'All businesses' })}</Chip>
              {filters!.categories.map((c) => (
                <Chip key={c.key} on={query.category === c.key} onClick={() => set({ category: query.category === c.key ? '' : c.key })} data={`cat-${c.key}`}>
                  {t(`industries.${c.key}`, { defaultValue: c.key === 'other' ? 'Other' : c.key })}<span className="opacity-60 text-xs">{c.n}</span>
                </Chip>
              ))}
            </div>
          )}
        </div>
      </section>}

      <section className="max-w-6xl mx-auto px-6 pb-16" data-deal-results>
        {!noDealsAtAll && <div className="flex items-center justify-between gap-3 mb-4 min-h-[28px]">
          <p className="text-sm text-gray-500" data-deal-count>
            {deals === null ? '' : total === 1 ? t('deals.page.countOne', { defaultValue: '1 deal' }) : t('deals.page.count', { defaultValue: '{{n}} deals', n: total })}
          </p>
          {anyFilter && <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#37352F]" data-deal-clear><X className="w-3.5 h-3.5" /> {t('deals.page.clear', { defaultValue: 'Clear filters' })}</button>}
        </div>}

        {error && <p role="alert" className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2 mb-4">{t('deals.page.error', { defaultValue: 'Could not load deals. Please try again.' })}</p>}

        {deals === null ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
        ) : deals.length === 0 ? (
          <>
          <div className="rounded-2xl border notion-border bg-[#F7F7F5] p-10 text-center" data-deal-empty>
            <Ticket className="w-8 h-8 mx-auto text-gray-300 mb-3" />
            <h2 className="font-semibold text-lg text-[#37352F]">
              {noDealsAtAll ? t('deals.page.soonTitle', { defaultValue: 'Deals are on their way' }) : t('deals.page.noneTitle', { defaultValue: 'No deals match yet' })}
            </h2>
            <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">
              {noDealsAtAll ? t('deals.page.soonBody', { defaultValue: 'Businesses are adding their first deals. Run a business? List yours for free.' })
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{deals.map((d) => <DealCard key={d.id} deal={d} />)}</div>
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
    </MarketingLayout>
  );
}
