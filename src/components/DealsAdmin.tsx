import { useEffect, useState } from 'react';
import { BadgePercent, ExternalLink, EyeOff, Eye, Loader2, RefreshCw, Search } from 'lucide-react';
import { adminListDeals, adminSetDealHidden, dealBadge, dateRange, type Deal } from '../lib/deals';

const fmtT = (k: string, o: Record<string, unknown>) => String(o.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_, n) => String(o[n] ?? ''));
const STATE: Record<string, string> = {
  live: 'bg-green-50 text-green-700', scheduled: 'bg-blue-50 text-blue-700', paused: 'bg-gray-100 text-gray-600',
  ended: 'bg-gray-50 text-gray-400', hidden: 'bg-red-50 text-red-700',
};

/**
 * Admin > Deals. Every deal shops have listed, newest first. Full admins can
 * take one off the public deals page (with a reason the shop sees) or put it back.
 */
export function DealsAdmin({ readOnly }: { readOnly: boolean }) {
  const [view, setView] = useState<'all' | 'live' | 'hidden'>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Deal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try { setRows(await adminListDeals(view, search)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load deals'); setRows([]); }
  };
  useEffect(() => { const id = setTimeout(() => void load(), search ? 300 : 0); return () => clearTimeout(id); }, [view, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (d: Deal) => {
    let reason: string | null = null;
    if (!d.hidden) {
      reason = window.prompt(`Hide “${d.title}” from the deals page? The shop sees this reason in their dashboard (optional).`, '');
      if (reason === null) return;
    } else if (!window.confirm(`Show “${d.title}” on the deals page again?`)) return;
    setBusy(d.id);
    try {
      const next = await adminSetDealHidden(d.id, !d.hidden, reason);
      setRows((r) => (r ?? []).map((x) => (x.id === next.id ? { ...x, ...next } : x)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not change the deal'); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6" data-admin-deals>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif-display font-semibold mb-1 flex items-center gap-2"><BadgePercent className="w-7 h-7" /> Deals</h1>
          <p className="text-gray-500 text-sm">Deals shops list on stampfix.app/deals, newest first. Hide one if it breaks the Terms or misleads customers.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/deals" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm border notion-border bg-white rounded-md px-3 py-1.5 hover:bg-[#F7F7F5]"><ExternalLink className="w-4 h-4" /> Deals page</a>
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 text-sm border notion-border bg-white rounded-md px-3 py-1.5 hover:bg-[#F7F7F5]"><RefreshCw className="w-4 h-4" /> Refresh</button>
        </div>
      </header>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="inline-flex rounded-lg border notion-border bg-white p-0.5 text-sm self-start">
          {(['all', 'live', 'hidden'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md ${view === v ? 'bg-[#37352F] text-white font-medium' : 'text-gray-600 hover:text-[#37352F]'}`}>
              {v === 'all' ? 'All' : v === 'live' ? 'On the deals page' : 'Hidden'}
            </button>
          ))}
        </div>
        <label className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, shop or city"
            className="w-full rounded-lg border notion-border bg-white pl-9 pr-3 py-2 text-sm" />
        </label>
      </div>

      {error && <p role="alert" className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {rows === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-10 text-center">No deals here yet.</p>
      ) : (
        <ul className="rounded-xl border notion-border bg-white divide-y divide-gray-100">
          {rows.map((d) => {
            const { from, to } = dateRange(d.starts_at, d.ends_at, 'en-GB');
            const badge = dealBadge(d, fmtT);
            return (
              <li key={d.id} className="flex items-start gap-3 px-4 py-3" data-admin-deal={d.title}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className={`font-semibold rounded-full px-2 py-0.5 ${STATE[d.state ?? 'live']}`}>{d.state}</span>
                    {badge && <span className="font-semibold text-[#37352F]">{badge}</span>}
                    <span className="text-gray-500">{d.business.name} · {d.city}{d.country ? ` (${d.country})` : ''} · {d.category}</span>
                  </div>
                  <div className="font-medium text-[#37352F] mt-1 break-words">{d.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{from} to {to}{d.code ? ` · code ${d.code}` : ''}</div>
                  {d.description && <p className="text-xs text-gray-600 mt-1 break-words line-clamp-2">{d.description}</p>}
                  {d.hidden && d.hidden_reason && <p className="text-xs text-red-700 mt-1">Reason: {d.hidden_reason}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a href={d.business.link} target="_blank" rel="noopener noreferrer" className="p-2 rounded-md hover:bg-[#F7F7F5] text-gray-500" title="Open the shop's page"><ExternalLink className="w-4 h-4" /></a>
                  {!readOnly && (
                    <button type="button" disabled={busy === d.id} onClick={() => void toggle(d)} data-admin-deal-toggle
                      className={`inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1.5 ${d.hidden ? 'notion-border hover:bg-[#F7F7F5]' : 'border-red-200 text-red-700 hover:bg-red-50'}`}>
                      {busy === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : d.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {d.hidden ? 'Show again' : 'Hide'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
