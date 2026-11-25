import { useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, ChevronDown, Check, Mail, Instagram, MessageCircle, Globe2, Plus, RotateCcw, ArrowRight, Clock } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { Dialog, btnLight, inputCls } from '../addonsUi';
import { getCoverage, getCountryCities, cityAsPlace, INDUSTRIES, countryName, type CoverageRow, type CountryCity, type Place } from '../../lib/outreach';
import { CATEGORIES } from '../../../supabase/functions/outreach-tools/lib';
import { flag, errorText } from './common';

// Every country (ISO 3166 codes), named by the browser in English.
const ALL_CODES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ '
  + 'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE '
  + 'GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP '
  + 'KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF '
  + 'NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN '
  + 'SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT '
  + 'ZA ZM ZW').split(' ');
const COUNTRIES = ALL_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
const PICK_KEY = 'stampfix_areas_country';

// "cafés" (how an imported shop's kind is written) -> "cafe", for the icon.
const KEY_BY_PLURAL = new Map(Object.entries(CATEGORIES).map(([k, c]) => [c.plural.toLowerCase(), k]));
const ICON = new Map(INDUSTRIES.map((i) => [i.key, i.icon]));
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const kindKey = (r: CoverageRow) => (ICON.has(r.category_key) ? r.category_key : KEY_BY_PLURAL.get((r.category ?? '').toLowerCase()) ?? null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type City = {
  key: string; country: string; city: string | null; region: string | null; rows: CoverageRow[];
  shops: number; withEmail: number; queued: number; reached: number; emailed: number; ig: number; replied: number;
  /** Not emailed or messaged yet. */
  open: number;
  lastContact: string | null; lastAdded: string;
};

function citiesOf(rows: CoverageRow[]): City[] {
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
  for (const c of byCity.values()) {
    c.open = c.shops - c.reached;
    c.rows.sort((a, b) => b.shops - a.shops);
  }
  return [...byCity.values()];
}

/** A city counts as started once emails there are queued, or anything was sent. */
const started = (c: City) => c.reached > 0 || c.queued > 0;

// "City of Langley" and "Langley" are the same place.
const cityKey = (name: string | null) => (name ?? '').toLowerCase().replace(/^(city|town|district|village) of /, '').replace(/[^a-z0-9]+/g, ' ').trim();
const SHOW_STEP = 120;

/**
 * Admin > Outreach > Areas, as a board: pick a country (any in the world),
 * then the cities you've reached out to (cards: click for details) and every
 * other city of that country (click one to find shops there).
 */
export function AreasTab({ onFindShops, onSearchCity }: { onFindShops?: () => void; onSearchCity?: (place: Place) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<CoverageRow[] | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [detail, setDetail] = useState<City | null>(null);

  useEffect(() => {
    getCoverage().then(setRows).catch((e) => { toast.error(errorText(e)); setRows([]); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cities = useMemo(() => citiesOf(rows ?? []), [rows]);
  // Countries in the list, where you worked last first, with their numbers.
  const mine = useMemo(() => {
    const m = new Map<string, { shops: number; reached: number; last: string }>();
    for (const c of cities) {
      const v = m.get(c.country) ?? { shops: 0, reached: 0, last: '' };
      v.shops += c.shops;
      if (started(c)) v.reached += 1;
      const last = c.lastContact ?? c.lastAdded;
      if (last > v.last) v.last = last;
      m.set(c.country, v);
    }
    return m;
  }, [cities]);

  // Start with the country picked last time, else where you worked last, else Canada.
  useEffect(() => {
    if (rows === null || country) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(PICK_KEY); } catch { /* no storage */ }
    const latest = [...mine.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last))[0]?.[0];
    setCountry(saved && ALL_CODES.includes(saved) ? saved : latest ?? 'CA');
  }, [rows, mine, country]);
  const pick = (code: string) => {
    setCountry(code);
    try { localStorage.setItem(PICK_KEY, code); } catch { /* no storage */ }
  };

  if (rows === null || !country) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

  const here = cities.filter((c) => c.country === country);
  // Reached or queued: latest contact (or, for queued only, latest added) first.
  const reached = here.filter(started).sort((a, b) => (b.lastContact ?? b.lastAdded).localeCompare(a.lastContact ?? a.lastAdded));
  const sum = (f: (c: City) => number) => here.reduce((n, c) => n + f(c), 0);
  const name = countryName(country);

  const reachedAll = cities.filter(started).length;
  return (
    <div className="space-y-4" data-areas-tab>
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <h3 className="font-semibold text-[#37352F]">Where you’ve reached out</h3>
        <p className="text-sm text-gray-500 mt-0.5">Pick a country: see the cities you’ve reached out to (click one for details) and every other city there (click one to find shops).</p>
        <dl className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-4" data-areas-totals>
          {([['Countries', mine.size], ['Cities in your list', cities.length], ['Cities reached', reachedAll],
            ['Emailed', cities.reduce((n, c) => n + c.emailed, 0)], ['Replies', cities.reduce((n, c) => n + c.replied, 0)]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd className="text-lg font-semibold text-[#37352F] tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </section>

      <div className="grid gap-3 lg:grid-cols-3 items-start" data-areas-board>
        {/* 1. The country */}
        <Column title="Country" icon={<Globe2 className="w-4 h-4" />} testId="country" scroll={false}>
          <CountryPicker value={country} mine={mine} onPick={pick} />
          <dl className="grid grid-cols-3 gap-2 mt-3" data-country-stats>
            {([['Shops', sum((c) => c.shops)], ['Cities in your list', here.length], ['Cities reached', reached.length],
              ['Emailed', sum((c) => c.emailed)], ['Still open', sum((c) => c.open)], ['Replies', sum((c) => c.replied)]] as const).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white border notion-border px-2.5 py-2">
                <dt className="text-[11px] text-gray-500 leading-tight">{k}</dt>
                <dd className="text-base font-semibold text-[#37352F] tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {mine.size > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Your countries</div>
              <div className="flex flex-wrap gap-1.5">
                {[...mine.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last)).map(([code, v]) => (
                  <button key={code} type="button" onClick={() => pick(code)} data-my-country={code}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${code === country ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border text-[#37352F] hover:bg-[#F7F7F5]'}`}>
                    <span aria-hidden>{flag(code)}</span>{countryName(code)}<span className={code === country ? 'text-white/70' : 'text-gray-400'}>{v.shops}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Column>

        {/* 2. Cities reached */}
        <Column title="Cities reached" count={reached.length} icon={<span className="w-4 h-4 rounded-full bg-green-600 text-white flex items-center justify-center"><Check className="w-3 h-3" strokeWidth={3} /></span>} testId="reached">
          {reached.length === 0 ? (
            <>
              <Empty>{here.length ? `No city in ${name} reached yet. Cities show up here as soon as you queue emails for, email or message a shop there.` : `No shops from ${name} in your list yet.`}</Empty>
              {onFindShops && <button type="button" className={`${btnLight} w-full`} onClick={onFindShops} data-areas-find><Plus className="w-4 h-4" />Find shops</button>}
            </>
          ) : reached.map((c) => (
            <CityCard key={c.key} city={c} onOpen={() => setDetail(c)} />
          ))}
        </Column>

        {/* 3. Every other city of the country */}
        <AllCities key={country} country={country} reachedKeys={new Set(reached.map((c) => cityKey(c.city)))} onSearchCity={onSearchCity} />
      </div>

      {detail && (
        <Dialog title={`${detail.city ?? 'No city'}${detail.region ? `, ${detail.region}` : ''}`} onClose={() => setDetail(null)} wide>
          <CityDetail city={detail} />
        </Dialog>
      )}
    </div>
  );
}

/** Every city and town of the country except the ones reached: click one to find shops there. */
function AllCities({ country, reachedKeys, onSearchCity }: { country: string; reachedKeys: Set<string>; onSearchCity?: (place: Place) => void }) {
  const [list, setList] = useState<CountryCity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(SHOW_STEP);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setList(null); setFailed(false);
    getCountryCities(country).then((c) => { if (alive) setList(c); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [country, attempt]);
  useEffect(() => { setShown(SHOW_STEP); }, [q]);

  const name = countryName(country);
  const needle = q.trim().toLowerCase();
  const open = (list ?? []).filter((c) => !reachedKeys.has(cityKey(c.name)));
  const matches = needle ? open.filter((c) => `${c.name} ${c.region ?? ''}`.toLowerCase().includes(needle)) : open;
  return (
    <Column title="Cities you can reach out to" count={list ? open.length : undefined} icon={<span className="w-4 h-4 rounded-full border-2 border-gray-400" />} testId="next">
      {!list && !failed && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500" data-cities-loading><Loader2 className="w-4 h-4 animate-spin" />Loading the cities of {name}…</div>
      )}
      {failed && (
        <div className="space-y-2" data-cities-failed>
          <Empty>Couldn’t load the cities of {name} right now. The map service may be busy.</Empty>
          <button type="button" className={`${btnLight} w-full`} onClick={() => setAttempt((n) => n + 1)}><RotateCcw className="w-4 h-4" />Try again</button>
        </div>
      )}
      {list && (<>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} pl-9`} placeholder={`Search ${open.length} cities`} aria-label="Search a city" data-cities-search />
        </div>
        {open.length > 0 && onSearchCity && !needle && <p className="px-1 text-[11px] text-gray-500">Biggest first. Click one to find shops there.</p>}
        {matches.length === 0 ? (
          <Empty>{needle ? 'No city matches that.' : `No cities of ${name} found on the map.`}</Empty>
        ) : matches.slice(0, shown).map((c) => (
          <button key={`${c.name}|${c.region}|${c.lat}`} type="button" disabled={!onSearchCity} onClick={() => onSearchCity?.(cityAsPlace(c, country))} data-all-city={c.name}
            className="group w-full flex items-center gap-2.5 text-left rounded-lg bg-white border notion-border shadow-sm px-3 py-2 hover:shadow-md hover:border-gray-300 transition">
            <span className="w-4 h-4 rounded-full border-2 border-gray-300 shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-[#37352F] break-words leading-snug">{c.name}</span>
              {c.region && <span className="block text-[11px] text-gray-500 break-words">{c.region}</span>}
            </span>
            {onSearchCity && <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#37352F] shrink-0 transition" />}
          </button>
        ))}
        {matches.length > shown && (
          <button type="button" className={`${btnLight} w-full`} onClick={() => setShown((n) => n + SHOW_STEP)} data-cities-more>
            Show more ({matches.length - shown} left)
          </button>
        )}
      </>)}
    </Column>
  );
}

/** A board column, like a Trello list. */
function Column({ title, count, icon, testId, scroll = true, children }: { title: string; count?: number; icon: ReactNode; testId: string; scroll?: boolean; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-[#F1F1EF] p-3 min-w-0" data-column={testId}>
      <h3 className="flex items-center gap-2 px-1 pb-2.5 text-sm font-semibold text-[#37352F]">
        <span className="text-gray-500 shrink-0 flex items-center">{icon}</span>
        <span className="min-w-0 truncate">{title}</span>
        {count != null && <span className="ml-auto text-xs font-medium text-gray-500 bg-white/70 rounded-full px-2 py-0.5">{count}</span>}
      </h3>
      {/* Long city lists scroll inside their column, like a Trello list. */}
      <div className={`space-y-2 ${scroll ? 'lg:max-h-[640px] lg:overflow-y-auto lg:pr-0.5' : ''}`}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500">{children}</p>;
}

/** One city as a card: a green tick once something was sent there, a blue clock while emails only wait in the queue. */
function CityCard({ city: c, onOpen }: { city: City; onOpen: () => void }) {
  const sent = c.reached > 0;
  return (
    <button type="button" onClick={onOpen} data-city-card={c.city ?? '(no city)'} data-city-state={sent ? 'reached' : 'queued'}
      className="w-full text-left rounded-lg bg-white border notion-border shadow-sm px-3 py-2.5 hover:shadow-md hover:border-gray-300 transition">
      <div className="flex items-start gap-2.5">
        {sent
          ? <span className="mt-0.5 w-5 h-5 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0" aria-label="Reached"><Check className="w-3.5 h-3.5" strokeWidth={3} /></span>
          : <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0" aria-label="Queued, nothing sent yet"><Clock className="w-3.5 h-3.5" strokeWidth={2.5} /></span>}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[#37352F] break-words leading-snug">{c.city ?? 'No city'}</div>
          {c.region && <div className="text-xs text-gray-500 break-words">{c.region}</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2 pl-[30px] text-xs" data-city-counts>
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5"><Mail className="w-3 h-3" />{c.emailed} emailed</span>
        {c.queued > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5"><Clock className="w-3 h-3" />{c.queued} queued</span>}
        <span className="rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">{c.open} open</span>
        {c.ig > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 text-pink-700 px-2 py-0.5"><Instagram className="w-3 h-3" />{c.ig}</span>}
        {c.replied > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 text-green-700 px-2 py-0.5"><MessageCircle className="w-3 h-3" />{plural(c.replied, 'reply', 'replies')}</span>}
      </div>
      <div className="text-[11px] text-gray-400 mt-1.5 pl-[30px]">
        {sent && c.lastContact ? `Last contact ${date(c.lastContact)}` : 'Queued: the first emails go out in your sending hours'}
      </div>
    </button>
  );
}

/** The country dropdown: every country in the world, with a search field. */
function CountryPicker({ value, mine, onPick }: { value: string; mine: Map<string, { shops: number }>; onPick: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    setTimeout(() => input.current?.focus(), 0);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const needle = q.trim().toLowerCase();
  const match = (c: { code: string; name: string }) => !needle || c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle;
  // Countries already in your list first, then the rest of the world.
  const list = [
    ...COUNTRIES.filter((c) => mine.has(c.code) && match(c)).map((c) => ({ ...c, group: 'mine' as const })),
    ...COUNTRIES.filter((c) => !mine.has(c.code) && match(c)).map((c) => ({ ...c, group: 'all' as const })),
  ];
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (code: string) => { onPick(code); setOpen(false); setQ(''); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list[active]) choose(list[active].code); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  };

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} data-country-picker
        className="w-full flex items-center gap-2.5 rounded-lg bg-white border notion-border px-3 py-2.5 text-left shadow-sm hover:border-gray-300">
        <span className="text-xl leading-none" aria-hidden>{flag(value)}</span>
        <span className="flex-1 min-w-0 font-semibold text-[#37352F] truncate">{countryName(value)}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg bg-white border notion-border shadow-lg overflow-hidden" data-country-menu>
          <div className="relative border-b notion-border">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search a country"
              className="w-full pl-9 pr-3 py-2.5 text-sm outline-none" aria-label="Search a country" data-country-search />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {list.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No country matches that.</li>}
            {list.map((c, i) => (
              <li key={c.code}>
                {(i === 0 || list[i - 1].group !== c.group) && (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{c.group === 'mine' ? 'In your list' : 'All countries'}</div>
                )}
                <button type="button" role="option" aria-selected={c.code === value} data-index={i} data-country-option={c.code}
                  onMouseEnter={() => setActive(i)} onClick={() => choose(c.code)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left ${i === active ? 'bg-[#F1F1EF]' : ''}`}>
                  <span aria-hidden>{flag(c.code)}</span>
                  <span className="flex-1 min-w-0 truncate text-[#37352F]">{c.name}</span>
                  {mine.has(c.code) && <span className="text-xs text-gray-400">{plural(mine.get(c.code)!.shops, 'shop')}</span>}
                  {c.code === value && <Check className="w-4 h-4 text-[#37352F]" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A city's kinds of shop and how far outreach got with each (the pop-up). */
function CityDetail({ city: c }: { city: City }) {
  const { t } = useTranslation();
  const label = (r: CoverageRow) =>
    r.category_key === 'other' && !r.category ? 'Other' : cap(r.category ?? t(`industries.${r.category_key}`, { defaultValue: r.category_key }));
  const keys = new Set(c.rows.map(kindKey).filter(Boolean));
  const missing = INDUSTRIES.filter((i) => !keys.has(i.key));
  return (
    <div className="px-5 pb-5 space-y-3" data-city-detail>
      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm text-gray-600">
        <span><b className="text-[#37352F]">{c.shops}</b> shop{c.shops === 1 ? '' : 's'}</span>
        <span><b className="text-[#37352F]">{c.withEmail}</b> with email</span>
        <span><b className="text-[#37352F]">{c.emailed}</b> emailed</span>
        <span><b className="text-[#37352F]">{c.open}</b> still open</span>
        <span><b className="text-[#37352F]">{c.ig}</b> on Instagram</span>
        {c.queued > 0 && <span><b className="text-[#37352F]">{c.queued}</b> queued</span>}
        {c.replied > 0 && <span className="text-green-700"><b>{c.replied}</b> replied</span>}
      </div>
      {c.lastContact && <p className="text-xs text-gray-500">Last contact {date(c.lastContact)}</p>}
      <div className="rounded-lg border notion-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 bg-[#FBFBFA]">
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
        <p className="text-xs text-gray-500" data-area-missing>
          <span className="font-medium text-gray-600">Not in your list here yet:</span>{' '}
          {missing.map((i) => t(`industries.${i.key}`, { defaultValue: i.key })).join(', ')}
        </p>
      )}
    </div>
  );
}
