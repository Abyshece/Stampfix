import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, ExternalLink, FileText, Loader2, RefreshCw, Utensils, Mail, Sparkles } from 'lucide-react';
import {
  adminListMenuUploads, adminSetMenuUpload, menuFileUrls, isPreviewableImage,
  type AdminMenuUpload, type MenuUploadStatus,
} from '../lib/ordering';

/**
 * Admin > Menus. Shops upload photos or a PDF of their menu (Add-ons > Upload
 * menu); we add the items for them, then mark the upload done. "Ask for new
 * photos" sends a short note the shop sees in its dashboard.
 */
const STATUS_LABEL: Record<MenuUploadStatus, string> = {
  new: 'New', in_progress: 'In progress', needs_info: 'Waiting for shop', done: 'Done',
};
const STATUS_STYLE: Record<MenuUploadStatus, string> = {
  new: 'bg-blue-50 text-blue-700', in_progress: 'bg-amber-50 text-amber-700',
  needs_info: 'bg-orange-50 text-orange-700', done: 'bg-green-50 text-green-700',
};
type Filter = MenuUploadStatus | 'all';

export function MenuUploadsAdmin({ readOnly, onNewCount }: { readOnly: boolean; onNewCount?: (n: number) => void }) {
  const [rows, setRows] = useState<AdminMenuUpload[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('new');
  const [urls, setUrls] = useState<Record<string, string>>({});

  const load = async () => {
    setError(null);
    try {
      const list = await adminListMenuUploads();
      setRows(list);
      onNewCount?.(list.filter((r) => r.status === 'new').length);
      // Links to view the files (the bucket is private); valid for an hour.
      const paths = list.flatMap((r) => r.files.map((f) => f.path));
      setUrls(paths.length ? await menuFileUrls(paths).catch(() => ({})) : {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load menu uploads');
      setRows([]);
    }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { new: 0, in_progress: 0, needs_info: 0, done: 0, all: 0 };
    for (const r of rows ?? []) { c[r.status] += 1; c.all += 1; }
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif-display font-semibold mb-1">Menus</h1>
          <p className="text-gray-500 text-sm">Menus uploaded by shops for table ordering. Add the items for the shop, then mark the upload done.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 text-sm border notion-border bg-white rounded-md px-3 py-1.5 hover:bg-[#F7F7F5]">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {(['new', 'in_progress', 'needs_info', 'done', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition ${
              filter === f ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border text-gray-600 hover:bg-[#F7F7F5]'
            }`}>
            {f === 'all' ? 'All' : STATUS_LABEL[f]}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filter === f ? 'bg-white/25' : f === 'new' && counts.new > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed notion-border py-14 text-center text-sm text-gray-400">
          <Utensils className="w-7 h-7 mx-auto mb-2 text-gray-300" />
          {filter === 'new' ? 'No new menus to add. Nice.' : 'Nothing here.'}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((r) => <UploadCard key={r.id} row={r} urls={urls} readOnly={readOnly} onChanged={() => void load()} />)}
        </div>
      )}
    </div>
  );
}

function UploadCard({ row, urls, readOnly, onChanged }: {
  row: AdminMenuUpload; urls: Record<string, string>; readOnly: boolean; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askNote, setAskNote] = useState('');
  const [copied, setCopied] = useState<'id' | 'prompt' | null>(null);
  const received = new Date(row.createdAt);

  const copy = async (what: 'id' | 'prompt', text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1500); }
    catch { window.prompt('Copy this:', text); }
  };
  const setStatus = async (status: MenuUploadStatus, note?: string) => {
    setBusy(true);
    try { await adminSetMenuUpload(row.id, status, note); setAsking(false); setAskNote(''); onChanged(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  // Ready-to-paste instructions for adding the items with Claude (attach the files).
  const currency = row.country === 'DE' ? 'EUR' : 'CAD';
  const prompt = [
    `Add this restaurant menu to Stampfix table ordering for "${row.businessName}" (shop ID ${row.campaignId}). The menu photos/PDF are attached.`,
    '',
    'In the Stampfix Supabase database:',
    `- public.menu_categories: one row per menu section, in menu order (campaign_id = '${row.campaignId}', name, position 0, 1, 2, ...)`,
    `- public.menu_items: one row per dish or drink (campaign_id = '${row.campaignId}', category_id, name, description, price in ${currency} as a number, available = true, position in menu order)`,
    '',
    'Keep names and prices exactly as on the menu. Only add a description when the menu has one. If a dish has sizes, add one item per size, e.g. "Cappuccino (large)".',
    row.menuItems > 0 ? `The shop already has ${row.menuItems} menu items: check them first and only add what is missing or changed.` : 'The shop has no menu items yet.',
    row.note ? `Note from the shop: "${row.note}"` : '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();

  return (
    <article className="rounded-xl border notion-border bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-[#37352F]">{row.businessName || 'Unnamed shop'}</h2>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
            <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{row.plan}</span>
            {row.country && <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{row.country}</span>}
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
            <span>Received {received.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            {row.ownerEmail && <a href={`mailto:${row.ownerEmail}`} className="inline-flex items-center gap-1 hover:text-[#37352F]"><Mail className="w-3 h-3" />{row.ownerEmail}</a>}
            <span>Menu items now: <b className="text-[#37352F]">{row.menuItems}</b></span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void copy('id', row.campaignId)} className="inline-flex items-center gap-1.5 text-xs border notion-border rounded-md px-2.5 py-1.5 hover:bg-[#F7F7F5] font-mono">
            {copied === 'id' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}{row.campaignId.slice(0, 8)}…
          </button>
          <button onClick={() => void copy('prompt', prompt)} className="inline-flex items-center gap-1.5 text-xs border notion-border rounded-md px-2.5 py-1.5 hover:bg-[#F7F7F5]">
            {copied === 'prompt' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Sparkles className="w-3.5 h-3.5" />}Copy prompt for Claude
          </button>
        </div>
      </div>

      {row.note && <p className="mt-3 text-sm bg-[#FBFBFA] border-l-2 border-[#37352F] px-3 py-2 rounded-r">“{row.note}”</p>}
      {row.adminNote && <p className="mt-2 text-xs text-orange-700">Our note to the shop: {row.adminNote}</p>}

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {row.files.map((f) => {
          const url = urls[f.path];
          return (
            <a key={f.path} href={url} target="_blank" rel="noreferrer" title={f.name}
              className={`group block rounded-lg border notion-border overflow-hidden bg-[#F7F7F5] ${url ? '' : 'pointer-events-none opacity-60'}`}>
              <div className="aspect-[3/4] flex items-center justify-center">
                {url && isPreviewableImage(f.type)
                  ? <img src={url} alt={f.name} loading="lazy" className="w-full h-full object-cover group-hover:opacity-90" />
                  : <div className="text-center px-2"><FileText className="w-8 h-8 mx-auto text-gray-400" /><div className="text-[10px] uppercase text-gray-400 mt-1">{(f.type ?? '').split('/').pop()}</div></div>}
              </div>
              <div className="px-2 py-1.5 bg-white text-[11px] text-gray-600 flex items-center gap-1">
                <span className="truncate flex-1">{f.name}</span><ExternalLink className="w-3 h-3 shrink-0 text-gray-400" />
              </div>
            </a>
          );
        })}
      </div>

      {!readOnly && (
        <div className="mt-4 pt-4 border-t notion-border">
          {asking ? (
            <div className="space-y-2">
              <textarea value={askNote} onChange={(e) => setAskNote(e.target.value)} maxLength={500} rows={2} autoFocus
                placeholder="What should the shop send again? They see this in their dashboard, e.g. “Page 2 is blurry, please upload it again.”"
                className="w-full border notion-border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#37352F]/10" />
              <div className="flex gap-2">
                <button disabled={busy || !askNote.trim()} onClick={() => void setStatus('needs_info', askNote)}
                  className="text-sm bg-orange-600 text-white rounded-md px-3 py-1.5 disabled:opacity-40">Send to shop</button>
                <button onClick={() => setAsking(false)} className="text-sm text-gray-500 px-2">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {row.status === 'new' && (
                <button disabled={busy} onClick={() => void setStatus('in_progress')} className="text-sm border notion-border bg-white rounded-md px-3 py-1.5 hover:bg-[#F7F7F5]">Start (in progress)</button>
              )}
              {row.status !== 'done' && (
                <button disabled={busy} onClick={() => void setStatus('done')}
                  className="inline-flex items-center gap-1.5 text-sm bg-green-600 text-white rounded-md px-3 py-1.5 hover:bg-green-700 disabled:opacity-40">
                  <Check className="w-4 h-4" />Menu added, mark done
                </button>
              )}
              {row.status !== 'done' && (
                <button disabled={busy} onClick={() => setAsking(true)} className="text-sm border notion-border bg-white rounded-md px-3 py-1.5 hover:bg-[#F7F7F5]">Ask for new photos</button>
              )}
              {row.status === 'done' && (
                <button disabled={busy} onClick={() => void setStatus('new')} className="text-sm text-gray-500 hover:text-[#37352F] px-1">Reopen</button>
              )}
              {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              {row.status !== 'done' && row.menuItems === 0 && (
                <span className="text-xs text-gray-400 ml-auto">The shop has no menu items yet.</span>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
