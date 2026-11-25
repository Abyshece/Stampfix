import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Instagram, Inbox, Copy, Check, ExternalLink, Pencil, AlertTriangle } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { inputCls, btnDark, btnLight } from '../addonsUi';
import {
  listLeads, updateLead, saveOutreachSettings, openInstagramWindow,
  igChatUrl, igProfileUrl, IG_HOME, IG_INBOX,
  type Lead, type LeadView, type OutreachState,
} from '../../lib/outreach';
import { ShopCell, Pill, IG_STATUS, LeadEditDialog, FilterChips, errorText } from './common';

type View = Extract<LeadView, 'ig_ready' | 'ig_sent' | 'ig_replied' | 'ig_stopped'>;

// The screen of an iPhone 17 Pro Max: 440 x 956 points.
const PHONE_W = 440;
const PHONE_H = 956;
const BEZEL = 10;
// Fits the browser window's height.
const phoneScreenHeight = () => Math.max(560, Math.min(PHONE_H, (typeof window === 'undefined' ? 900 : window.innerHeight) - 32 - BEZEL * 2));

/**
 * Instagram: Instagram doesn't let tools send the first message, and its
 * website can't be shown inside another site. So each chat opens in its own
 * small window, placed on an iPhone 17 Pro Max frame beside the messages (on
 * wide screens; else phone-sized at the right edge). For each shop the
 * message is written here, copied with one click and the shop's chat opens on
 * the phone. Paste, send, close it, then mark it sent here.
 */
export function InstagramTab({ state, readOnly, onChanged }: { state: OutreachState; readOnly: boolean; onChanged: () => void }) {
  const toast = useRef(useToast()).current;
  const s = state.settings;
  const [view, setView] = useState<View>('ig_ready');
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Lead | null>(null);
  const [account, setAccount] = useState(s.ig_account ?? '');
  const [screenH, setScreenH] = useState(phoneScreenHeight);
  useEffect(() => {
    const onResize = () => setScreenH(phoneScreenHeight());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const open = (url: string) => openInstagramWindow(url);

  const load = useCallback(() => {
    setLeads(null);
    listLeads(view, '', 500).then((l) => { setLeads(l); setTexts({}); }).catch((e) => { toast.error(errorText(e)); setLeads([]); });
  }, [view, toast]);
  useEffect(load, [load]);

  const saveAccount = async () => {
    try { await saveOutreachSettings({ ig_account: account }); toast.success('Saved'); onChanged(); }
    catch (e) { toast.error(errorText(e)); }
  };
  const copyAndOpen = async (l: Lead) => {
    const text = texts[l.id] ?? l.ig_message;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Message copied. Paste it in the chat (Cmd+V) and press Enter.');
    } catch {
      toast.error('Couldn’t copy. Select the message and copy it by hand.');
    }
    open(igChatUrl(l.instagram!));
    setOpened((o) => new Set(o).add(l.id));
  };
  const mark = async (l: Lead, status: 'sent' | 'replied' | 'not_interested' | 'skipped' | 'new') => {
    try {
      await updateLead(l.id, { ig_status: status });
      setLeads((list) => list?.filter((x) => x.id !== l.id) ?? list);
      onChanged();
    } catch (e) { toast.error(errorText(e)); }
  };

  const over = state.ig_24h >= s.ig_daily_limit;
  const ig = state.ig;

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-6 xl:items-start" data-ig-dock-anchor>
    <div className="space-y-4 min-w-0">
      {/* Our account */}
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: 'linear-gradient(45deg, #F58529, #DD2A7B 50%, #8134AF 80%, #515BD4)' }}><Instagram className="w-5 h-5" /></span>
            <div className="min-w-0">
              <div className="font-semibold text-[#37352F]">{s.ig_account ? `@${s.ig_account}` : 'Your Instagram'}</div>
              <div className="text-xs text-gray-500">
                <span className="hidden xl:inline">Opens on the phone beside the messages. Log in there once; each “Copy &amp; open chat” then opens that shop’s chat on it.</span>
                <span className="xl:hidden">Opens in a phone-sized window next to this one. Log in there once; each “Copy &amp; open chat” then opens that shop’s chat in its own small window.</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className={btnDark} onClick={() => open(IG_HOME)}><Instagram className="w-4 h-4" />Open Instagram</button>
            <button type="button" className={btnLight} onClick={() => open(IG_INBOX)}><Inbox className="w-4 h-4" />Messages</button>
            {s.ig_account && <button type="button" className={btnLight} onClick={() => open(igProfileUrl(s.ig_account!))}>Our profile</button>}
          </div>
        </div>
        {!readOnly && !s.ig_account && (
          <div className="flex items-center gap-2 mt-3 max-w-md">
            <input value={account} onChange={(e) => setAccount(e.target.value)} className={inputCls} placeholder="Our Instagram name, e.g. stampfix.app" />
            <button type="button" className={btnLight} disabled={!account.trim()} onClick={() => void saveAccount()}>Save</button>
          </div>
        )}
        <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${over ? 'bg-amber-50 text-amber-900' : 'bg-[#F7F7F5] text-gray-600'}`}>
          {over && <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span>
            Messaged in the last 24 hours: <b>{state.ig_24h}</b> of {s.ig_daily_limit}.
            {over ? ' Stop for today: Instagram blocks accounts that send many similar messages to people who don’t follow them.' : ' Keep it personal and spread out; Instagram limits accounts that send many similar messages.'}
          </span>
        </div>
      </section>

      <FilterChips<View> value={view} onChange={setView} options={[
        { id: 'ig_ready', label: 'To message' },
        { id: 'ig_sent', label: 'Messaged', count: ig.sent ?? 0 },
        { id: 'ig_replied', label: 'Replied', count: ig.replied ?? 0 },
        { id: 'ig_stopped', label: 'Stopped', count: (ig.not_interested ?? 0) + (ig.skipped ?? 0) },
      ]} />

      {leads === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border notion-border bg-white p-8 text-center text-sm text-gray-500">
          {view === 'ig_ready' ? 'No shops with an Instagram account waiting. “Check websites” under Shops finds them, or add one by hand.' : 'Nothing here.'}
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-1">
          {leads.map((l) => (
            <li key={l.id} className="rounded-xl border notion-border bg-white p-4 flex flex-col gap-3" data-ig-row={l.business_name}>
              <div className="flex items-start justify-between gap-3">
                <ShopCell lead={l} />
                <a href={igProfileUrl(l.instagram!)} onClick={(e) => { e.preventDefault(); open(igProfileUrl(l.instagram!)); }}
                  className="inline-flex items-center gap-1 text-sm font-medium text-pink-700 hover:underline shrink-0">@{l.instagram}<ExternalLink className="w-3.5 h-3.5" /></a>
              </div>
              {view === 'ig_ready' ? (
                <>
                  <textarea rows={5} value={texts[l.id] ?? l.ig_message} onChange={(e) => setTexts((t) => ({ ...t, [l.id]: e.target.value }))}
                    className={`${inputCls} resize-y text-[13px] leading-relaxed`} aria-label={`Message to ${l.business_name}`} />
                  {!readOnly && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" className={btnDark} onClick={() => void copyAndOpen(l)}><Copy className="w-4 h-4" />Copy &amp; open chat</button>
                      {opened.has(l.id) && (
                        <button type="button" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-green-600 text-white" onClick={() => void mark(l, 'sent')}>
                          <Check className="w-4 h-4" />I sent it
                        </button>
                      )}
                      <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#37352F]" onClick={() => setEditing(l)}><Pencil className="w-3.5 h-3.5" />First line</button>
                      <button type="button" className="ml-auto text-xs font-medium text-gray-400 hover:text-gray-700" onClick={() => void mark(l, 'skipped')}>Skip</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <Pill cls={IG_STATUS[l.ig_status][1]}>{IG_STATUS[l.ig_status][0]}</Pill>
                  {l.ig_sent_at && <span className="text-[11px] text-gray-400">{new Date(l.ig_sent_at).toLocaleDateString()}</span>}
                  {!readOnly && (
                    <div className="ml-auto flex items-center gap-2">
                      <button type="button" className="text-xs font-medium text-gray-600 hover:text-[#37352F]" onClick={() => open(igChatUrl(l.instagram!))}>Open chat</button>
                      {view === 'ig_sent' && <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium bg-green-600 text-white" onClick={() => void mark(l, 'replied')}>They replied</button>}
                      {(view === 'ig_sent' || view === 'ig_replied') && <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium border notion-border text-gray-600" onClick={() => void mark(l, 'not_interested')}>Not interested</button>}
                      <button type="button" className="text-xs text-gray-400 hover:text-gray-700" onClick={() => void mark(l, 'new')}>Undo</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && <LeadEditDialog lead={editing} defaultFirstLine={s.default_first_line} readOnly={readOnly}
        onClose={() => setEditing(null)} onSaved={() => { load(); onChanged(); }} />}
    </div>

    {/* The phone: Instagram's window sits exactly on its screen (wide screens only). */}
    <aside className="hidden xl:block xl:sticky xl:top-4" aria-label="Instagram phone" data-ig-dock>
      <div className="rounded-[56px] bg-[#1C1C1E] shadow-2xl ring-1 ring-black/10" style={{ padding: BEZEL }}>
        <div className="relative rounded-[46px] bg-white overflow-hidden flex flex-col items-center justify-center text-center px-8"
          style={{ width: PHONE_W, height: screenH }} data-ig-dock-screen>
          <span className="absolute top-3 left-1/2 -translate-x-1/2 w-[120px] h-[34px] rounded-full bg-black" aria-hidden />
          <span className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-4"
            style={{ background: 'linear-gradient(45deg, #F58529, #DD2A7B 50%, #8134AF 80%, #515BD4)' }}><Instagram className="w-8 h-8" /></span>
          <div className="font-semibold text-[#37352F]">Instagram opens here</div>
          <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">Log in once. Then each “Copy &amp; open chat” opens that shop’s chat right on this phone.</p>
          <ol className="mt-4 text-sm text-[#37352F] text-left space-y-1.5" data-ig-steps>
            <li><span className="font-semibold">1.</span> Paste: Cmd+V (Ctrl+V on Windows)</li>
            <li><span className="font-semibold">2.</span> Press Enter to send</li>
            <li><span className="font-semibold">3.</span> Close it: Cmd+W (Ctrl+W)</li>
            <li><span className="font-semibold">4.</span> Click “I sent it” here</li>
          </ol>
          <button type="button" className={`${btnDark} mt-5`} onClick={() => open(IG_INBOX)} data-ig-open-here><Instagram className="w-4 h-4" />Open Instagram here</button>
          <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">Instagram doesn’t allow itself inside other websites, so each chat is its own small window placed on this phone, iPhone 17 Pro Max size. Clicking this page puts it behind.</p>
        </div>
      </div>
    </aside>
    </div>
  );
}
