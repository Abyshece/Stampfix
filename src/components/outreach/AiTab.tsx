import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Square, Play, Check, X, RotateCcw, ExternalLink, AlertTriangle, Search, FlaskConical } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { Switch, inputCls, btnDark, btnLight } from '../addonsUi';
import {
  getAiState, listAiLeads, startAiSearch, cancelAiSearch, acceptAiEmail, rejectAiEmail, saveAiSettings, runAiNow, testAi,
  getSearchStatus, googleSearchUrl, BLOCK_LABEL,
  type AiState, type AiView, type Lead, type OutreachState, type BlockReason,
} from '../../lib/outreach';
import { ShopCell, LinkIcons, Pill, EMAIL_STATUS, errorText } from './common';

// The worker searches up to 4 shops a minute; about 3 is a fair estimate.
const PER_MINUTE = 3;

function duration(shops: number): string {
  const m = Math.max(1, Math.ceil(shops / PER_MINUTE));
  return m < 60 ? `about ${m} min` : `about ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const shortUrl = (url: string) => {
  try { const u = new URL(url); return (u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname)).slice(0, 60); } catch { return url.slice(0, 60); }
};
const reasonText = (r: string | null) => (r && r in BLOCK_LABEL ? BLOCK_LABEL[r as BlockReason]
  : r === 'already_queued' ? 'already queued' : r === 'not_new' ? 'already contacted' : r ?? '');

/**
 * Admin > Outreach > AI email finder. Shops without an email address go to
 * Google's Gemini AI (with Google Search). An address is used
 * only when a page we open ourselves shows it next to the shop's name (or
 * it's on the shop's own website); those go into the email queue by
 * themselves. Anything else waits under "Check these" for a person.
 */
export function AiTab({ state: outreach, readOnly, onChanged }: { state: OutreachState; readOnly: boolean; onChanged: () => void }) {
  // The toast helper changes identity whenever a toast shows; a ref keeps the callbacks steady.
  const toastRef = useRef(useToast());
  const toast = toastRef.current;
  const [ai, setAi] = useState<AiState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [view, setView] = useState<AiView | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const runTotal = useRef(0);
  const lastFound = useRef<number | null>(null);

  const loadState = useCallback(async () => {
    try {
      const s = await getAiState();
      setAi(s);
      setLoadError(null);
      return s;
    } catch (e) {
      setLoadError(errorText(e));
      return null;
    }
  }, []);
  const checkKey = useCallback(async () => {
    try { setHasKey((await getSearchStatus()).ai_key === true); } catch { setHasKey(null); }
  }, []);
  useEffect(() => { void loadState(); void checkKey(); }, [loadState, checkKey]);

  // First view: what needs a person, else what's happening, else the results.
  useEffect(() => {
    if (!ai || view) return;
    setView(ai.suggested ? 'suggested' : ai.waiting ? 'waiting' : ai.found ? 'found' : ai.not_found ? 'not_found' : 'not_searched');
  }, [ai, view]);

  // While shops wait, follow along every few seconds.
  const waiting = ai?.waiting ?? 0;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => { void loadState(); }, 5000);
    return () => clearInterval(t);
  }, [waiting, loadState]);
  useEffect(() => {
    if (waiting > runTotal.current) runTotal.current = waiting;
    if (waiting === 0) runTotal.current = 0;
  }, [waiting]);
  // New addresses change the numbers at the top of Outreach too.
  useEffect(() => {
    if (!ai) return;
    if (lastFound.current !== null && lastFound.current !== ai.found) onChanged();
    lastFound.current = ai.found;
  }, [ai, onChanged]);

  const countsKey = ai ? `${ai.not_searched}.${ai.waiting}.${ai.working}.${ai.found}.${ai.suggested}.${ai.not_found}` : '';
  const loadLeads = useCallback(() => {
    if (!view) return;
    listAiLeads(view).then(setLeads).catch((e) => { toast.error(errorText(e)); setLeads([]); });
  }, [view, toast]);
  useEffect(() => { loadLeads(); }, [loadLeads, countsKey]);

  const after = async () => { await loadState(); loadLeads(); onChanged(); };

  const start = async (ids?: string[]) => {
    setBusy(true);
    try {
      const r = await startAiSearch(ids);
      if (!r.queued) {
        toast.success('Nothing new to search.');
      } else {
        toast.success(`${r.queued} shop${r.queued === 1 ? '' : 's'} in line. It runs by itself, so you can close this page.`);
        runAiNow().catch(() => { /* the database starts it within a minute anyway */ });
        setView('waiting');
      }
      await after();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const stop = async () => {
    setBusy(true);
    try {
      const r = await cancelAiSearch();
      toast.success(`Stopped. ${r.cancelled} shop${r.cancelled === 1 ? '' : 's'} taken out of line.`);
      await after();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const settings = async (patch: { auto_queue?: boolean; resume?: boolean }) => {
    setBusy(true);
    try {
      setAi(await saveAiSettings(patch));
      if (patch.resume) runAiNow().catch(() => { /* within a minute anyway */ });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setTesting(true);
    try {
      const r = await testAi();
      if (r.ok) toast.success(`The AI works (${r.model}${r.searched_google ? ', with Google Search' : ''}).`);
      else toast.error(r.error ?? 'The AI didn’t answer.');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setTesting(false);
    }
  };

  if (loadError && !ai) {
    return (
      <div className="rounded-xl border notion-border bg-white p-5 text-sm">
        <p className="text-red-600">{loadError}</p>
        <p className="text-gray-500 mt-2">If this is the first time, the AI email finder’s database update may not be applied yet.</p>
      </div>
    );
  }
  if (!ai) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

  const paused = !!ai.paused_until;
  const done = runTotal.current ? runTotal.current - ai.waiting : 0;
  const tiles: Array<{ id: AiView; label: string; count: number; tone: string }> = [
    { id: 'not_searched', label: 'Not searched', count: ai.not_searched, tone: 'text-[#37352F]' },
    { id: 'waiting', label: 'Searching', count: ai.waiting, tone: 'text-violet-700' },
    { id: 'found', label: 'Found', count: ai.found, tone: 'text-green-700' },
    { id: 'suggested', label: 'Check these', count: ai.suggested, tone: 'text-amber-700' },
    { id: 'not_found', label: 'Not found', count: ai.not_found, tone: 'text-gray-500' },
  ];

  return (
    <div className="space-y-4" data-ai-tab>
      {hasKey === false && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-ai-setup>
          <div className="font-semibold mb-1">One-time setup: a Gemini key</div>
          <p className="mb-2">The AI email finder uses Google’s Gemini AI with Google Search:</p>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li>Open <a className="underline font-medium" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a>, sign in with a Google account and click <b>Create API key</b>.</li>
            <li>Turn on billing for the key’s project in AI Studio. Google only includes Search with billing on; the first 5,000 searches a month are free, and the AI’s answers cost a fraction of a cent per shop.</li>
            <li>In Supabase: Edge Functions, Secrets, add <code className="bg-white/70 rounded px-1">GEMINI_API_KEY</code> with that key.</li>
          </ol>
          <p className="mt-2 text-xs">Only public details are sent: the shop’s name, town, address, phone and website.</p>
          <button type="button" className={`${btnLight} mt-3`} onClick={() => void checkKey()}><RotateCcw className="w-4 h-4" />Check again</button>
        </section>
      )}

      {/* What it does, and the controls */}
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></div>
          <div className="min-w-0">
            <h3 className="font-semibold text-[#37352F]">Find missing email addresses with AI</h3>
            <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">
              For each shop without an email address, Google’s Gemini AI searches the web: its website, Google listing, Facebook, Yelp.
              Then we open the page ourselves. An address is used only when that page shows it next to the shop’s name, or it’s on the shop’s own website.
              Anything else waits for you under “Check these”.
            </p>
          </div>
        </div>

        <div className="mt-4">
          {ai.waiting > 0 ? (
            <div className="rounded-lg bg-violet-50/70 border border-violet-100 px-4 py-3" data-ai-progress>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm text-violet-900">
                  {paused ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  <span>
                    {paused ? 'Waiting: ' : 'Searching: '}<b>{ai.waiting}</b> shop{ai.waiting === 1 ? '' : 's'} to go{!paused && `, ${duration(ai.waiting)} left`}
                    {done > 0 && <span className="text-violet-700/80"> · {done} done</span>}
                  </span>
                </div>
                {!readOnly && <button type="button" className={btnLight} disabled={busy} onClick={() => void stop()}><Square className="w-4 h-4" />Stop</button>}
              </div>
              {runTotal.current > 0 && (
                <div className="h-1.5 rounded-full bg-white mt-2.5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all" style={{ width: `${Math.max(3, (done / runTotal.current) * 100)}%` }} />
                </div>
              )}
              <p className="text-xs text-violet-800/80 mt-2">It keeps going when you close this page.</p>
            </div>
          ) : ai.not_searched > 0 ? (
            <div className="flex items-center gap-3 flex-wrap">
              {!readOnly && (
                <button type="button" className={btnDark} disabled={busy || hasKey === false} onClick={() => void start()} data-ai-start>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Find emails for {ai.not_searched} shop{ai.not_searched === 1 ? '' : 's'}
                </button>
              )}
              <span className="text-xs text-gray-500">
                Takes {duration(ai.not_searched)} and runs by itself.
                {ai.not_searched > 150 && ' If Google’s daily limit is reached, it pauses and carries on after midnight Pacific time.'}
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              {ai.no_email === 0 ? 'Every shop in your list has an email address.' : 'Every shop without an email address has been searched.'}
            </p>
          )}

          {paused && (
            <div className="mt-3 flex items-start gap-2 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2" data-ai-paused>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div>Paused until {when(ai.paused_until!)}.{ai.last_error ? ` ${ai.last_error}` : ''}</div>
              </div>
              {!readOnly && <button type="button" className="text-sm font-medium underline shrink-0" disabled={busy} onClick={() => void settings({ resume: true })}>Resume now</button>}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t notion-border flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Switch on={ai.auto_queue} disabled={readOnly || busy} onChange={() => void settings({ auto_queue: !ai.auto_queue })} label="Queue confirmed addresses" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-[#37352F]">Put confirmed addresses straight into the email queue</div>
              <div className="text-xs text-gray-500">
                They go out like the others: your daily limit, hours and blocks under Email and Settings.
                {ai.auto_queue && outreach.settings.paused && ' Sending is paused under Email, so they wait in the queue until you switch it on.'}
              </div>
            </div>
          </div>
          {!readOnly && hasKey !== false && (
            <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#37352F]" disabled={testing} onClick={() => void test()}>
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}Test the AI
            </button>
          )}
        </div>
        {(ai.email_off > 0 || ai.searched_24h > 0) && (
          <p className="mt-3 text-xs text-gray-500">
            {ai.searched_24h > 0 && `${ai.searched_24h} searched in the last 24 hours. `}
            {ai.email_off > 0 && `${ai.email_off} shop${ai.email_off === 1 ? '' : 's'} in places where email is off (like Germany or Quebec) aren’t searched.`}
          </p>
        )}
      </section>

      {/* Results */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="tablist">
        {tiles.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={view === t.id} onClick={() => setView(t.id)} data-ai-view={t.id}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${view === t.id ? 'border-[#37352F] bg-white shadow-sm' : 'notion-border bg-white hover:bg-[#F7F7F5]'}`}>
            <div className={`text-xl font-semibold tabular-nums ${t.count ? t.tone : 'text-gray-300'}`}>{t.count}</div>
            <div className="text-xs text-gray-500 truncate">{t.label}</div>
          </button>
        ))}
      </div>

      {view === 'suggested' && ai.suggested > 0 && (
        <p className="text-xs text-gray-500">The AI found these but no page we could open confirms them (often they’re only on Facebook). Have a quick look, then use or reject each one.</p>
      )}
      {view === 'found' && ai.found > 0 && (
        <p className="text-xs text-gray-500">Confirmed on a web page{ai.auto_queue ? ' and put into the email queue' : ''}. {ai.found_queued} of {ai.found} are queued or emailed.</p>
      )}
      {view === 'not_found' && ai.not_found > 0 && !readOnly && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">No public address found. Many small shops only answer on Instagram: try them under Instagram.</p>
          <button type="button" className={btnLight} disabled={busy || hasKey === false || !leads?.length} onClick={() => void start(leads?.map((l) => l.id))}>
            <RotateCcw className="w-4 h-4" />Search {leads && leads.length < ai.not_found ? leads.length : 'all'} again
          </button>
        </div>
      )}

      {leads === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border notion-border bg-white p-8 text-center text-sm text-gray-500">
          {view === 'suggested' ? 'Nothing to check. Addresses the AI finds but can’t confirm show up here.'
            : view === 'found' ? 'No addresses found yet.'
              : view === 'waiting' ? 'No shops waiting.'
                : view === 'not_found' ? 'Nothing here.'
                  : 'Every shop without an email address has been searched.'}
        </div>
      ) : (
        <ul className="rounded-xl border notion-border bg-white divide-y divide-gray-100">
          {leads.map((l) => (
            <AiRow key={`${l.id}.${l.ai_status}.${l.ai_email}`} lead={l} view={view!} readOnly={readOnly} autoQueue={ai.auto_queue}
              searchDisabled={busy || hasKey === false} onSearchAgain={() => void start([l.id])} onDone={() => void after()} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AiRow({ lead: l, view, readOnly, autoQueue, searchDisabled, onSearchAgain, onDone }: {
  lead: Lead; view: AiView; readOnly: boolean; autoQueue: boolean; searchDisabled: boolean; onSearchAgain: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState(l.ai_email ?? '');
  const [busy, setBusy] = useState(false);

  const use = async () => {
    setBusy(true);
    try {
      const typed = email.trim().toLowerCase();
      const r = await acceptAiEmail(l.id, typed && typed !== l.ai_email ? typed : null, autoQueue);
      toast.success(r.queued ? `Saved and queued for ${l.business_name}.`
        : autoQueue && r.reason ? `Saved. Not queued: ${reasonText(r.reason)}.` : 'Saved. Queue it under Email when you’re ready.');
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await rejectAiEmail(l.id);
      toast.success('Suggestion removed.');
      onDone();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const google = (
    <a className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#37352F]" href={googleSearchUrl(l)} target="_blank" rel="noopener noreferrer" title="Search Google yourself">
      <Search className="w-3.5 h-3.5" />Google
    </a>
  );

  return (
    <li className="px-3 sm:px-4 py-3 flex flex-col md:flex-row md:items-start gap-3" data-ai-row={l.business_name}>
      <div className="md:w-[38%] min-w-0">
        <ShopCell lead={l} />
        <div className="flex items-center gap-2 mt-1"><LinkIcons lead={l} />{google}</div>
      </div>

      <div className="flex-1 min-w-0 text-sm">
        {view === 'suggested' && (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={readOnly || busy} aria-label={`Email for ${l.business_name}`}
                className={`${inputCls} flex-1 min-w-[200px]`} data-ai-email />
              {!readOnly && (
                <div className="flex gap-2">
                  <button type="button" className={btnDark} disabled={busy || !email.trim()} onClick={() => void use()} data-ai-use>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Use it
                  </button>
                  <button type="button" className={btnLight} disabled={busy} onClick={() => void reject()} data-ai-reject><X className="w-4 h-4" />Not theirs</button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 break-words">
              {l.ai_note}
              {l.ai_source && <> <a className="inline-flex items-center gap-0.5 underline hover:text-[#37352F]" href={l.ai_source} target="_blank" rel="noopener noreferrer">{shortUrl(l.ai_source)}<ExternalLink className="w-3 h-3" /></a></>}
            </p>
          </div>
        )}

        {view === 'found' && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-[#37352F] break-all">{l.email}</span>
              <Pill cls={EMAIL_STATUS[l.email_status][1]}>{EMAIL_STATUS[l.email_status][0]}</Pill>
            </div>
            <p className="text-xs text-gray-500 break-words">
              {l.email_source && /^https?:/.test(l.email_source)
                ? <>Seen on <a className="inline-flex items-center gap-0.5 underline hover:text-[#37352F]" href={l.email_source} target="_blank" rel="noopener noreferrer">{shortUrl(l.email_source)}<ExternalLink className="w-3 h-3" /></a></>
                : l.email_source}
            </p>
          </div>
        )}

        {view === 'not_found' && (
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-gray-500 break-words pt-1">
              {l.ai_note ?? 'No public email address found.'}
              {l.ai_status === 'failed' && ' The search failed 3 times.'}
            </p>
            {!readOnly && (
              <button type="button" className={`${btnLight} !py-1.5 shrink-0`} disabled={searchDisabled} onClick={onSearchAgain}><RotateCcw className="w-3.5 h-3.5" />Search again</button>
            )}
          </div>
        )}

        {view === 'waiting' && (
          <p className="text-xs pt-1">
            {l.ai_status === 'working'
              ? <span className="inline-flex items-center gap-1.5 text-violet-700"><Loader2 className="w-3.5 h-3.5 animate-spin" />Searching now…</span>
              : <span className="text-gray-500">In line</span>}
          </p>
        )}

        {view === 'not_searched' && (
          <p className="text-xs text-gray-500 pt-1 break-words">
            {l.website ? <>Website: {shortUrl(l.website)}{l.website_checked_at ? ' (no address on it)' : ''}</> : 'No website known'}
          </p>
        )}
      </div>
    </li>
  );
}
