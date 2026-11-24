import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, MapPin, Check, Plus, ArrowRight, Info } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { inputCls, btnDark, btnLight } from '../addonsUi';
import {
  findPlaces, findShops, addLeads, INDUSTRIES, emailOffReason, countryName, BLOCK_LABEL,
  type Place, type FoundShop,
} from '../../lib/outreach';
import { LinkIcons, errorText, flag } from './common';

/**
 * Find shops: pick a place anywhere in the world and a kind of shop; shops
 * come from OpenStreetMap (each with a Google Maps link to check reviews and
 * photos). Tick the ones to keep and add them to your list.
 */
export function FindTab({ readOnly, onAdded }: { readOnly: boolean; onAdded: (checkWebsites: boolean) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [radius, setRadius] = useState(5);
  const [chains, setChains] = useState(false);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<{ shops: FoundShop[]; chainsHidden: number } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const lookUpPlace = async () => {
    if (q.trim().length < 2) return;
    setSearchingPlace(true);
    try {
      const list = await findPlaces(q.trim());
      setPlaces(list);
      if (list.length === 1) { setPlace(list[0]); setPlaces(null); }
      if (!list.length) toast.error('No place found with that name.');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSearchingPlace(false);
    }
  };

  const search = async () => {
    if (!place || !category) return;
    setFinding(true);
    setFound(null);
    try {
      const r = await findShops(place, category, radius, chains);
      setFound({ shops: r.shops, chainsHidden: r.chains_hidden });
      setPicked(new Set(r.shops.map((s) => s.osm_ref)));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setFinding(false);
    }
  };

  const add = async () => {
    if (!found) return;
    const rows = found.shops.filter((s) => picked.has(s.osm_ref)).map(({ chain: _c, ...s }) => s);
    if (!rows.length) return;
    setAdding(true);
    try {
      const r = await addLeads(rows);
      toast.success(`Added ${r.added} shop${r.added === 1 ? '' : 's'}${r.duplicates ? ` (${r.duplicates} already in your list)` : ''}`);
      setFound(null);
      onAdded(rows.some((s) => s.website && !s.email));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setAdding(false);
    }
  };

  const stats = useMemo(() => {
    const s = found?.shops ?? [];
    return { email: s.filter((x) => x.email).length, ig: s.filter((x) => x.instagram).length, web: s.filter((x) => x.website).length };
  }, [found]);
  const off = place ? emailOffReason(place.country, place.region) : null;
  const allPicked = !!found && found.shops.length > 0 && picked.size === found.shops.length;

  return (
    <div className="space-y-5">
      {/* Where */}
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-[#37352F] mb-2">1. Where</h3>
        {place ? (
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 min-w-0">
              <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#37352F] break-words">{place.label}</div>
                <div className="text-xs text-gray-500">{flag(place.country)} {countryName(place.country)}{place.timezone ? ` · emails go out in ${place.timezone.replace(/_/g, ' ')} time` : ''}</div>
              </div>
            </div>
            <button type="button" className={btnLight} onClick={() => { setPlace(null); setFound(null); }}>Change</button>
          </div>
        ) : (
          <>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void lookUpPlace(); }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} className={inputCls}
                placeholder="City or neighbourhood, anywhere: e.g. Surrey BC, Kitsilano Vancouver, Brooklyn" />
              <button className={btnDark} disabled={searchingPlace || q.trim().length < 2}>
                {searchingPlace ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}Search
              </button>
            </form>
            {places && places.length > 1 && (
              <ul className="mt-2 divide-y divide-gray-100 border notion-border rounded-lg overflow-hidden">
                {places.map((p, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => { setPlace(p); setPlaces(null); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[#F7F7F5] flex items-center gap-2">
                      <span>{flag(p.country)}</span><span className="min-w-0 break-words">{p.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {off && (
          <p className="mt-3 flex items-start gap-2 text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{BLOCK_LABEL[off]}. You can still add these shops and message them on Instagram.</span>
          </p>
        )}
      </section>

      {/* What */}
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-[#37352F] mb-3">2. What kind of shop</h3>
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.map((ind) => (
            <button key={ind.key} type="button" onClick={() => setCategory(ind.key)} data-industry={ind.key}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition ${category === ind.key ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border text-[#37352F] hover:bg-[#F7F7F5]'}`}>
              <span aria-hidden>{ind.icon}</span>{t(`industries.${ind.key}`, { defaultValue: ind.key })}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 flex-wrap mt-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Within
            <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="border notion-border rounded-lg px-2 py-1.5 text-sm bg-white">
              {[1, 2, 5, 10, 25].map((r) => <option key={r} value={r}>{r} km</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={chains} onChange={(e) => setChains(e.target.checked)} />
            Include chains (Starbucks and the like)
          </label>
          <button type="button" className={`${btnDark} ml-auto`} disabled={!place || !category || finding} onClick={() => void search()}>
            {finding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}Find shops
          </button>
        </div>
      </section>

      {/* Results */}
      {finding && <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />Searching the map… this can take up to a minute.</div>}
      {found && (
        <section className="rounded-xl border notion-border bg-white">
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap p-4 border-b notion-border">
            <div className="text-sm text-[#37352F]">
              <span className="font-semibold">{found.shops.length} found</span>
              <span className="text-gray-500"> · website {stats.web} · email {stats.email} · Instagram {stats.ig}{found.chainsHidden ? ` · ${found.chainsHidden} chains hidden` : ''}</span>
              <p className="text-xs text-gray-500 mt-0.5">Most emails and Instagram accounts are on the shops’ websites: after adding, “Check websites” finds them.</p>
            </div>
            {!readOnly && found.shops.length > 0 && (
              <button type="button" className={btnDark} disabled={adding || picked.size === 0} onClick={() => void add()}>
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add {picked.size} to my list
              </button>
            )}
          </div>
          {found.shops.length === 0 ? (
            <p className="p-6 text-sm text-gray-500 text-center">No shops of this kind on the map here. Try a bigger distance or a nearby city.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 bg-[#FBFBFA]">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left">
                      <input type="checkbox" aria-label="Select all" checked={allPicked}
                        onChange={() => setPicked(allPicked ? new Set() : new Set(found.shops.map((s) => s.osm_ref)))} />
                    </th>
                    <th className="px-3 py-2 text-left font-medium">Shop</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Links</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {found.shops.map((s) => (
                    <tr key={s.osm_ref} className={picked.has(s.osm_ref) ? '' : 'opacity-60'} data-found={s.osm_ref}>
                      <td className="px-3 py-2 align-top">
                        <input type="checkbox" aria-label={`Select ${s.business_name}`} checked={picked.has(s.osm_ref)}
                          onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(s.osm_ref)) n.delete(s.osm_ref); else n.add(s.osm_ref); return n; })} />
                      </td>
                      <td className="px-3 py-2 align-top min-w-[180px]">
                        <div className="font-medium text-[#37352F] break-words">{s.business_name}{s.chain && <span className="ml-1.5 text-[11px] text-gray-400">chain</span>}</div>
                        <div className="text-xs text-gray-500 break-words">{s.address || s.city}</div>
                      </td>
                      <td className="px-3 py-2 align-top hidden md:table-cell text-xs text-gray-600 break-all">{s.email ?? '—'}</td>
                      <td className="px-3 py-2 align-top"><LinkIcons lead={s} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-4 py-3 text-[11px] text-gray-400 border-t notion-border">Map data © OpenStreetMap contributors.</p>
        </section>
      )}
      {!found && !finding && (
        <p className="text-sm text-gray-500 flex items-center gap-1.5"><Check className="w-4 h-4 text-gray-400" />Shops you add show up under <b className="font-medium">Shops</b>; then <ArrowRight className="w-3.5 h-3.5" /> Email or Instagram.</p>
      )}
    </div>
  );
}
