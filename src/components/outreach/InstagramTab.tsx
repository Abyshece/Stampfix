import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Instagram, Inbox, Copy, Check, ExternalLink, Pencil, AlertTriangle, Download, CheckCircle2, Smartphone } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { inputCls, btnDark, btnLight } from '../addonsUi';
import {
  listLeads, updateLead, saveOutreachSettings, openInstagramWindow, phoneInstalled, phoneOutdated, openInPhone, PHONE_DOWNLOAD, PHONE_VERSION,
  igChatUrl, igProfileUrl, IG_HOME, IG_INBOX,
  type Lead, type LeadView, type OutreachState,
} from '../../lib/outreach';
import { ShopCell, Pill, IG_STATUS, LeadEditDialog, FilterChips, errorText } from './common';
import { IgSendQueue } from './IgSendQueue';

type View = Extract<LeadView, 'ig_ready' | 'ig_sent' | 'ig_replied' | 'ig_stopped'>;

/**
 * Instagram: Instagram doesn't let tools send the first message, and its
 * website can't be shown inside another site. With the Stampfix Phone
 * extension, Instagram sits in Chrome's side panel right next to this page:
 * the message is written here, copied with one click, and the shop's chat
 * opens in the phone, where you paste and send. Without it, each chat opens in
 * a phone-sized window. Then mark it sent here.
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
  // The Stampfix Phone marks the page as it loads.
  const [phone] = useState(phoneInstalled);
  const [outdated] = useState(phoneOutdated);
  const [phoneClosed, setPhoneClosed] = useState(false);
  // The shop the send queue is on (highlighted in the list).
  const [queueId, setQueueId] = useState<string | null>(null);
  useEffect(() => {
    if (queueId) document.querySelector(`[data-ig-row-id="${queueId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [queueId]);
  const open = (url: string) => {
    if (!phone) { openInstagramWindow(url); return; }
    void openInPhone(url).then((r) => {
      if (!r.ok) toast.error('The Stampfix Phone didn’t answer. Reload this page and try again.');
      setPhoneClosed(r.ok && !r.panel);
    });
  };

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
      toast.success(phone ? 'Message copied. Click the message box in the phone, paste (Cmd+V) and press Enter.' : 'Message copied. Paste it in the chat (Cmd+V) and press Enter.');
    } catch {
      toast.error('Couldn’t copy. Select the message and copy it by hand.');
    }
    open(igChatUrl(l.instagram!));
    setOpened((o) => new Set(o).add(l.id));
  };
  const mark = async (l: Lead, status: 'sent' | 'replied' | 'not_interested' | 'skipped' | 'new'): Promise<boolean> => {
    try {
      await updateLead(l.id, { ig_status: status });
      setLeads((list) => list?.filter((x) => x.id !== l.id) ?? list);
      onChanged();
      return true;
    } catch (e) { toast.error(errorText(e)); return false; }
  };
  // The send queue: the chat in the phone, the message typed in (and copied, in case).
  const textOf = (l: Lead) => texts[l.id] ?? l.ig_message;
  const queueOpen = async (l: Lead, text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* the phone types it in */ }
    const r = await openInPhone(igChatUrl(l.instagram!), text);
    if (!r.ok) toast.error('The Stampfix Phone didn’t answer. Reload this page and try again.');
    setPhoneClosed(r.ok && !r.panel);
    setOpened((o) => new Set(o).add(l.id));
    return r;
  };

  const over = state.ig_24h >= s.ig_daily_limit;
  const ig = state.ig;

  return (
    <div className="space-y-4">
      {/* Our account */}
      <section className="rounded-xl border notion-border bg-white p-4 sm:p-5">
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: 'linear-gradient(45deg, #F58529, #DD2A7B 50%, #8134AF 80%, #515BD4)' }}><Instagram className="w-5 h-5" /></span>
            <div className="min-w-0">
              <div className="font-semibold text-[#37352F]">{s.ig_account ? `@${s.ig_account}` : 'Your Instagram'}</div>
              <div className="text-xs text-gray-500">
                {phone
                  ? 'Opens in the Stampfix Phone at the right side of Chrome. Log in there once; each “Copy & open chat” opens that shop’s chat in it, so you paste and send without leaving this page.'
                  : 'Opens in a phone-sized window next to this one. Log in there once; each “Copy & open chat” opens that shop’s chat in its own window.'}
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

      {phone && outdated && (
        <div className="hidden md:flex items-start gap-3 text-sm rounded-xl px-4 py-3 border bg-amber-50 border-amber-200 text-amber-900" data-phone-update>
          <Download className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <b>A newer Stampfix Phone is ready ({PHONE_VERSION}).</b> It types each message into the chat for the send queue, shows Instagram’s phone layout and a login screen.
            Download it, unzip it over your old <b>stampfix-phone</b> folder, then click the reload arrow on Stampfix Phone in <code className="text-xs bg-white/70 px-1 py-0.5 rounded">chrome://extensions</code> and reload this page.
          </div>
          <a href={PHONE_DOWNLOAD} download className={`${btnDark} shrink-0`}><Download className="w-4 h-4" />Download</a>
        </div>
      )}
      {phone ? (
        <div className={`flex items-start gap-2 text-sm rounded-xl px-4 py-3 border ${phoneClosed ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-green-50 border-green-200 text-green-900'}`} data-phone-status>
          {phoneClosed ? <Smartphone className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{phoneClosed
            ? 'The phone is closed. Click the Stampfix Phone icon in Chrome’s toolbar (pin it from the puzzle icon) and it opens on that chat.'
            : 'Stampfix Phone is ready: Instagram opens in the panel at the right of this window. Not logged in? The phone shows a “Log in to Instagram” button.'}</span>
        </div>
      ) : (
        <section className="hidden md:block rounded-xl border notion-border bg-white p-5" data-phone-setup>
          <div className="flex items-start gap-4">
            <span className="w-10 h-10 rounded-xl bg-[#37352F] text-white flex items-center justify-center shrink-0"><Smartphone className="w-5 h-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[#37352F]">Put Instagram right next to these messages</div>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                Chrome won’t show Instagram inside a website, but it will in a side panel next to this page. The Stampfix Phone extension
                does that: Instagram in a phone-sized panel at the right of this window, logged in with your normal Instagram.
                “Copy &amp; open chat” then opens each chat right there, so you paste and send without switching windows.
              </p>
              <ol className="mt-3 space-y-1.5 text-sm text-[#37352F] list-decimal pl-5">
                <li>Download the extension and unzip it.</li>
                <li>In Chrome, go to <code className="text-xs bg-[#F7F7F5] px-1 py-0.5 rounded">chrome://extensions</code> and switch on <b>Developer mode</b> (top right).</li>
                <li>Click <b>Load unpacked</b> and pick the unzipped <b>stampfix-phone</b> folder.</li>
                <li>Reload this page. The first “Copy &amp; open chat” opens the phone; pin Stampfix Phone from the puzzle icon to open it any time.</li>
              </ol>
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <a href={PHONE_DOWNLOAD} download className={btnDark} data-phone-download><Download className="w-4 h-4" />Download Stampfix Phone</a>
                <span className="text-xs text-gray-400">Until then, Instagram opens in a separate window.</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {phone && !readOnly && view === 'ig_ready' && leads !== null && (
        <IgSendQueue leads={leads} textOf={textOf} sentToday={state.ig_24h} limit={s.ig_daily_limit} typesIn={!outdated}
          onOpen={queueOpen} onMark={mark} onCurrent={setQueueId} />
      )}

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
        <ul className="grid gap-3 lg:grid-cols-2">
          {leads.map((l) => (
            <li key={l.id} className={`rounded-xl border bg-white p-4 flex flex-col gap-3 ${queueId === l.id ? 'border-pink-400 ring-2 ring-pink-200' : 'notion-border'}`}
              data-ig-row={l.business_name} data-ig-row-id={l.id} data-ig-current={queueId === l.id ? '' : undefined}>
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
  );
}
