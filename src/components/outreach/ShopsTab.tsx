import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search, Upload, Pencil, ScanSearch, Square } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { Dialog, inputCls, btnDark, btnLight } from '../addonsUi';
import {
  listLeads, scanWebsites, saveScans, addLeads, leadsFromCsv,
  type Lead, type OutreachState,
} from '../../lib/outreach';
import { ShopCell, LinkIcons, Pill, EMAIL_STATUS, IG_STATUS, LeadEditDialog, errorText } from './common';

/**
 * Your list of shops: check their websites for an email address and an
 * Instagram account, paste in a list, and edit each shop.
 */
export function ShopsTab({ state, readOnly, autoScan, onAutoScanStarted, onChanged }: {
  state: OutreachState; readOnly: boolean; autoScan: boolean; onAutoScanStarted: () => void; onChanged: () => void;
}) {
  // The toast helper changes identity whenever a toast shows; a ref keeps the callbacks steady.
  const toastRef = useRef(useToast());
  const toast = toastRef.current;
  const [view, setView] = useState<'all' | 'unchecked'>('all');
  const [search, setSearch] = useState('');
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [importing, setImporting] = useState(false);
  const [scan, setScan] = useState<{ done: number; total: number; found: number } | null>(null);
  const stop = useRef(false);

  const load = useCallback(() => {
    listLeads(view, search, 500).then(setLeads).catch((e) => { toast.error(errorText(e)); setLeads([]); });
  }, [view, search, toast]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = setTimeout(load, search ? 250 : 0); return () => clearTimeout(h); }, [load, search]);

  const checkWebsites = useCallback(async () => {
    stop.current = false;
    let todo: Lead[];
    try { todo = (await listLeads('unchecked', '', 1000)).filter((l) => l.website); } catch (e) { toast.error(errorText(e)); return; }
    if (!todo.length) { toast.success('Every website is already checked.'); return; }
    let found = 0;
    setScan({ done: 0, total: todo.length, found: 0 });
    for (let i = 0; i < todo.length && !stop.current; i += 6) {
      const batch = todo.slice(i, i + 6).map((l) => ({ id: l.id, website: l.website! }));
      try {
        const results = await scanWebsites(batch);
        const r = await saveScans(results);
        found += r.found;
      } catch (e) {
        toast.error(errorText(e));
        break;
      }
      setScan({ done: Math.min(i + 6, todo.length), total: todo.length, found });
    }
    setScan(null);
    toast.success(`Checked the websites: found an email or Instagram for ${found} shop${found === 1 ? '' : 's'}.`);
    load();
    onChanged();
  }, [load, onChanged, toast]);

  // Straight after adding shops from the map, check their websites.
  useEffect(() => {
    if (autoScan && !readOnly && !scan) { onAutoScanStarted(); void checkWebsites(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScan]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-9`} placeholder="Search name, city, email or Instagram" />
        </div>
        <select value={view} onChange={(e) => setView(e.target.value as 'all' | 'unchecked')} className="border notion-border rounded-lg px-2.5 py-2 text-sm bg-white">
          <option value="all">All shops ({state.leads})</option>
          <option value="unchecked">Websites not checked yet ({state.unchecked})</option>
        </select>
        {!readOnly && (scan ? (
          <button type="button" className={btnLight} onClick={() => { stop.current = true; }}><Square className="w-4 h-4" />Stop</button>
        ) : (
          <button type="button" className={btnDark} disabled={state.unchecked === 0} onClick={() => void checkWebsites()}
            title="Reads each shop's website for the email address and Instagram account it publishes">
            <ScanSearch className="w-4 h-4" />Check websites ({state.unchecked})
          </button>
        ))}
        {!readOnly && <button type="button" className={btnLight} onClick={() => setImporting(true)}><Upload className="w-4 h-4" />Import list</button>}
      </div>

      {scan && (
        <div className="rounded-lg bg-[#F7F7F5] px-4 py-3 text-sm text-[#37352F]">
          <div className="flex justify-between gap-3"><span>Checking websites… {scan.done} of {scan.total}</span><span className="text-gray-500">found {scan.found}</span></div>
          <div className="h-1.5 rounded-full bg-white mt-2 overflow-hidden"><div className="h-full bg-[#37352F] transition-all" style={{ width: `${(scan.done / scan.total) * 100}%` }} /></div>
        </div>
      )}

      {leads === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border notion-border bg-white p-8 text-center text-sm text-gray-500">
          {search ? 'No shop matches that.' : 'No shops yet. Find some under “Find shops”, or import a list.'}
        </div>
      ) : (
        <div className="rounded-xl border notion-border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-[#FBFBFA]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Shop</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">Instagram</th>
                <th className="px-3 py-2 text-left font-medium">Links</th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((l) => (
                <tr key={l.id} data-lead={l.business_name}>
                  <td className="px-3 py-2.5 align-top min-w-[170px]"><ShopCell lead={l} /></td>
                  <td className="px-3 py-2.5 align-top text-xs break-all min-w-[140px]">
                    {l.email ?? <span className="text-gray-400">{l.website && !l.website_checked_at ? 'not checked yet' : '—'}</span>}
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs hidden lg:table-cell">{l.instagram ? `@${l.instagram}` : <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-2.5 align-top"><LinkIcons lead={l} /></td>
                  <td className="px-3 py-2.5 align-top hidden md:table-cell">
                    <div className="flex flex-col items-start gap-1">
                      <Pill cls={EMAIL_STATUS[l.email_status][1]}>{EMAIL_STATUS[l.email_status][0]}</Pill>
                      {l.instagram && <Pill cls={IG_STATUS[l.ig_status][1]}>IG: {IG_STATUS[l.ig_status][0]}</Pill>}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <button type="button" onClick={() => setEditing(l)} aria-label={`Edit ${l.business_name}`}
                      className="p-1.5 rounded-md text-gray-400 hover:text-[#37352F] hover:bg-[#F1F1EF]"><Pencil className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <LeadEditDialog lead={editing} defaultFirstLine={state.settings.default_first_line} readOnly={readOnly}
        onClose={() => setEditing(null)} onSaved={() => { load(); onChanged(); }} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => { load(); onChanged(); }} />}
    </div>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [country, setCountry] = useState('CA');
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const run = async () => {
    const { leads, problems: p } = leadsFromCsv(text, country);
    setProblems(p);
    if (!leads.length) return;
    setBusy(true);
    try {
      const r = await addLeads(leads);
      toast.success(`Added ${r.added}${r.duplicates ? `, ${r.duplicates} already in your list` : ''}${r.invalid ? `, ${r.invalid} skipped` : ''}`);
      onDone();
      if (!p.length) onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Import a list of shops" onClose={onClose}>
      <div className="px-5 space-y-3">
        <p className="text-sm text-gray-600">Paste from a spreadsheet (CSV or copied cells). The first row names the columns:</p>
        <code className="block text-xs bg-[#F7F7F5] rounded-md px-2 py-1.5 break-words">name, email, website, instagram, city, region, country, category, phone</code>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className={`${inputCls} font-mono text-xs`}
          placeholder={'name,email,website,city,region\nBean There,hello@beanthere.ca,beanthere.ca,Surrey,BC'} />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Country for rows without one
          <input value={country} maxLength={2} onChange={(e) => setCountry(e.target.value.toUpperCase())} className="w-16 border notion-border rounded-lg px-2 py-1 text-sm uppercase" />
        </label>
        <p className="text-xs text-gray-500">Only add addresses the shops publish themselves (their website or listing).</p>
        {problems.length > 0 && <ul className="text-xs text-red-600 list-disc pl-4 max-h-28 overflow-y-auto">{problems.slice(0, 20).map((p) => <li key={p}>{p}</li>)}</ul>}
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
        <button type="button" className={btnLight} onClick={onClose}>Cancel</button>
        <button type="button" className={btnDark} disabled={busy || !text.trim()} onClick={() => void run()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Add shops</button>
      </div>
    </Dialog>
  );
}
