import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Eye, Pencil, X, AlertTriangle, ChevronDown, Play } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { Switch, btnDark, btnLight } from '../addonsUi';
import {
  listLeads, queueEmails, cancelQueued, updateLead, saveOutreachSettings, sendNextNow, sendGapMinutes,
  type Lead, type LeadView, type OutreachState,
} from '../../lib/outreach';
import { ShopCell, Pill, EMAIL_STATUS, BlockPill, LeadEditDialog, PreviewDialog, FilterChips, errorText } from './common';

type View = Extract<LeadView, 'email_ready' | 'email_queued' | 'email_sent' | 'email_followup' | 'email_replied' | 'email_stopped'>;
const SKIP_REASON: Record<string, string> = {
  no_email: 'no email', not_new: 'already emailed', not_sent: 'not emailed yet', too_soon: 'too soon for a follow-up',
  already_queued: 'already queued', opted_out: 'opted out', has_account: 'has a Stampfix account',
  customer_domain: 'same company as a shop on Stampfix', consent_country: 'email off in this country', french_required: 'Quebec needs French',
};

/**
 * Email: queue emails for shops (they go out one at a time within the daily
 * limit, in each shop's afternoon), mark replies, queue follow-ups.
 */
export function EmailTab({ state, readOnly, onChanged }: { state: OutreachState; readOnly: boolean; onChanged: () => void }) {
  const toast = useRef(useToast()).current;
  const s = state.settings;
  const [view, setView] = useState<View>('email_ready');
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [preview, setPreview] = useState<{ lead: Lead; kind: 'first' | 'followup' } | null>(null);
  const [setupOpen, setSetupOpen] = useState(state.sent_total === 0);

  const load = useCallback(() => {
    setLeads(null);
    listLeads(view, '', 500).then((l) => { setLeads(l); setPicked(new Set()); }).catch((e) => { toast.error(errorText(e)); setLeads([]); });
  }, [view, toast]);
  useEffect(load, [load]);
  const after = () => { load(); onChanged(); };

  const toggleSending = async () => {
    setBusy(true);
    try {
      await saveOutreachSettings({ paused: !s.paused });
      toast.success(s.paused ? 'Sending is on' : 'Sending is paused');
      onChanged();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const sendNow = async () => {
    setBusy(true);
    try {
      const r = await sendNextNow();
      const msg = {
        sent: 'Sent the next email.', paused: 'Sending is paused.', cap: `Daily limit reached (${s.daily_cap}).`,
        idle: 'Nothing to send right now: no queued shop is inside its sending hours.', failed: `Couldn’t send: ${r.error ?? ''}`,
      }[r.status];
      if (r.status === 'sent') toast.success(msg); else if (r.status === 'failed') toast.error(msg); else toast.info(msg);
      after();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const queue = async (kind: 'first' | 'followup') => {
    setBusy(true);
    try {
      const r = await queueEmails([...picked], kind);
      const skipped = r.skipped.map((x) => `${x.business}: ${SKIP_REASON[x.reason] ?? x.reason}`);
      toast.success(`Queued ${r.queued} ${kind === 'followup' ? 'follow-up' : 'email'}${r.queued === 1 ? '' : 's'}${skipped.length ? `. Skipped ${skipped.length}: ${skipped.slice(0, 3).join('; ')}${skipped.length > 3 ? '…' : ''}` : ''}`);
      after();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const cancel = async (ids: string[]) => {
    setBusy(true);
    try { await cancelQueued(ids); toast.success('Taken out of the queue'); after(); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const mark = async (l: Lead, status: 'replied' | 'not_interested' | 'skipped' | 'new') => {
    try { await updateLead(l.id, { email_status: status }); after(); }
    catch (e) { toast.error(errorText(e)); }
  };

  const e = state.email;
  const selectable = view === 'email_ready' || view === 'email_followup' || view === 'email_queued';
  const canPick = (l: Lead) => view === 'email_queued' || !l.blocked;
  const pickable = (leads ?? []).filter(canPick);
  const allPicked = pickable.length > 0 && pickable.every((l) => picked.has(l.id));
  const hours = `${String(s.window_start).padStart(2, '0')}:00 to ${String(s.window_end).padStart(2, '0')}:00`;
  // The email that goes out next: the oldest queued one whose shop is inside its sending hours.
  const nextUp = view === 'email_queued' && !s.paused ? (leads ?? []).find((l) => l.in_hours)?.id ?? null : null;

  return (
    <div className="space-y-4">
      {/* Sending */}
      <section className={`rounded-xl border p-4 sm:p-5 ${s.paused ? 'notion-border bg-white' : 'border-green-200 bg-green-50/40'}`}>
        <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Switch on={!s.paused} onChange={() => void toggleSending()} disabled={readOnly || busy} label="Sending" />
            <div>
              <div className="font-semibold text-[#37352F]">{s.paused ? 'Sending is paused' : 'Sending is on'}</div>
              <div className="text-xs text-gray-500" data-send-pace>Up to {s.daily_cap} a day, about one every {sendGapMinutes(s.daily_cap, s.window_start, s.window_end)} minutes, {hours} {s.weekdays_only ? 'on weekdays ' : ''}in each shop’s own time zone.</div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span><b>{state.sent_24h}</b><span className="text-gray-500"> of {s.daily_cap} sent in 24 h</span></span>
            <span><b>{state.queued}</b><span className="text-gray-500"> queued</span></span>
            {!readOnly && <button type="button" className={btnLight} disabled={busy || state.queued === 0} onClick={() => void sendNow()}><Play className="w-4 h-4" />Send next now</button>}
          </div>
        </div>
        {s.pause_reason && (
          <p className="mt-3 flex items-start gap-2 text-sm rounded-lg bg-red-50 text-red-800 px-3 py-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {s.pause_reason === 'complaint'
              ? 'Paused automatically: someone marked an email as spam. Their address is blocked. Check your list and wording before switching on again.'
              : 'Paused automatically: more than 3% of recent emails bounced. Check the addresses in your list before switching on again.'}
          </p>
        )}
        <button type="button" onClick={() => setSetupOpen((o) => !o)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#37352F]">
          <ChevronDown className={`w-3.5 h-3.5 transition ${setupOpen ? 'rotate-180' : ''}`} />Before your first send
        </button>
        {setupOpen && (
          <ol className="mt-2 text-xs text-gray-600 list-decimal pl-5 space-y-1">
            <li>Add the DMARC record for stampfix.app in Vercel: TXT <code>_dmarc</code> = <code>v=DMARC1; p=none</code>.</li>
            <li>In Resend, add a webhook to <code>…/functions/v1/outreach-webhook</code> for “email.bounced” and “email.complained”, and save its signing secret as <code>RESEND_WEBHOOK_SECRET</code> in Supabase. Bounced and spam-reporting addresses are then blocked for good. A spam report also pauses sending.</li>
            <li>Open a shop, click <b>Preview</b>, then <b>Send test</b>, and check it in your Gmail.</li>
            <li>Resend’s free plan allows 100 emails a day in total, including the app’s own emails. Leave a little room in the daily limit for them.</li>
          </ol>
        )}
      </section>

      <FilterChips<View> value={view} onChange={setView} options={[
        { id: 'email_ready', label: 'Ready to email' },
        { id: 'email_queued', label: 'Queued', count: (e.queued ?? 0) + (e.followup_queued ?? 0) },
        { id: 'email_sent', label: 'Emailed', count: (e.sent ?? 0) + (e.followed_up ?? 0) },
        { id: 'email_followup', label: 'Follow-up due', count: state.followups_due },
        { id: 'email_replied', label: 'Replied', count: e.replied ?? 0 },
        { id: 'email_stopped', label: 'Stopped', count: (e.not_interested ?? 0) + (e.bounced ?? 0) + (e.complained ?? 0) + (e.unsubscribed ?? 0) + (e.skipped ?? 0) },
      ]} />

      {selectable && !readOnly && (leads?.length ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-[#F7F7F5] px-3 py-2">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(pickable.map((l) => l.id)))} />
            Select all ({pickable.length})
          </label>
          {view === 'email_ready' && <button type="button" className={btnDark} disabled={busy || picked.size === 0} onClick={() => void queue('first')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Queue {picked.size} email{picked.size === 1 ? '' : 's'}</button>}
          {view === 'email_followup' && <button type="button" className={btnDark} disabled={busy || picked.size === 0} onClick={() => void queue('followup')}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Queue {picked.size} follow-up{picked.size === 1 ? '' : 's'}</button>}
          {view === 'email_queued' && <button type="button" className={btnLight} disabled={busy || picked.size === 0} onClick={() => void cancel([...picked])}><X className="w-4 h-4" />Take {picked.size} out of the queue</button>}
        </div>
      )}

      {view === 'email_queued' && (leads?.length ?? 0) > 0 && (
        <p className="text-xs text-gray-500" data-queue-order>
          In sending order: oldest first. A shop outside its sending hours right now (in its own time zone) waits, and the next one in line goes instead.
        </p>
      )}

      {leads === null ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border notion-border bg-white p-8 text-center text-sm text-gray-500">
          {view === 'email_ready' ? 'No shops with an email address waiting. Find shops, then “Check websites” under Shops.' : 'Nothing here.'}
        </div>
      ) : (
        <ul className="rounded-xl border notion-border bg-white divide-y divide-gray-100">
          {leads.map((l, i) => (
            <li key={l.id} className="flex items-start gap-3 px-3 sm:px-4 py-3" data-email-row={l.business_name}>
              {view === 'email_queued' && (
                <span className="mt-0.5 w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-gray-400" data-queue-pos>#{i + 1}</span>
              )}
              {selectable && !readOnly && (
                <input type="checkbox" className="mt-1" aria-label={`Select ${l.business_name}`} disabled={!canPick(l)} checked={picked.has(l.id)}
                  onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <ShopCell lead={l} />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {view === 'email_queued' && l.id === nextUp && <span className="text-[11px] font-semibold bg-green-600 text-white rounded-full px-2 py-0.5" data-up-next>Up next</span>}
                    {view !== 'email_ready' && <Pill cls={EMAIL_STATUS[l.email_status][1]}>{EMAIL_STATUS[l.email_status][0]}</Pill>}
                    {view === 'email_ready' && <BlockPill reason={l.blocked} />}
                  </div>
                </div>
                <div className="text-xs text-gray-600 mt-1 break-all">{l.email}</div>
                {view === 'email_ready' && (
                  <div className="text-xs text-gray-500 mt-1 italic break-words">“{l.first_line || 'Default first line'}”</div>
                )}
                {view === 'email_queued' && l.queued_at && (
                  <div className="text-[11px] text-gray-400 mt-1" data-queued-at>
                    Queued {new Date(l.queued_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {l.in_hours === false && <span className="text-amber-700"> · Waits for {String(s.window_start).padStart(2, '0')}:00 in its time zone</span>}
                  </div>
                )}
                {l.email_sent_at && <div className="text-[11px] text-gray-400 mt-1">Emailed {new Date(l.email_sent_at).toLocaleDateString()}</div>}
                {l.last_error && view === 'email_ready' && <div className="text-xs text-red-600 mt-1 break-words">Last try failed: {l.last_error}</div>}
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {(view === 'email_ready' || view === 'email_followup') && (
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-[#37352F]"
                      onClick={() => setPreview({ lead: l, kind: view === 'email_followup' ? 'followup' : 'first' })}><Eye className="w-3.5 h-3.5" />Preview</button>
                  )}
                  {view === 'email_ready' && !readOnly && (
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-[#37352F]" onClick={() => setEditing(l)}><Pencil className="w-3.5 h-3.5" />Edit first line</button>
                  )}
                  {view === 'email_queued' && !readOnly && (
                    <button type="button" className="text-xs font-medium text-gray-600 hover:text-[#37352F]" onClick={() => void cancel([l.id])}>Take out of queue</button>
                  )}
                  {(view === 'email_sent' || view === 'email_followup') && !readOnly && (
                    <>
                      <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium bg-green-600 text-white" onClick={() => void mark(l, 'replied')}>They replied</button>
                      <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium border notion-border text-gray-600" onClick={() => void mark(l, 'not_interested')}>Not interested</button>
                    </>
                  )}
                  {view === 'email_replied' && !readOnly && (
                    <button type="button" className="px-2.5 py-1 rounded-md text-xs font-medium border notion-border text-gray-600" onClick={() => void mark(l, 'not_interested')}>Not interested</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        Replies arrive in your Gmail. Mark them here so no follow-up goes out. When someone asks you to stop, mark them
        “Not interested” straight away (Canada’s anti-spam law gives you 10 business days); their address is then blocked for good.
      </p>

      {editing && <LeadEditDialog lead={editing} defaultFirstLine={s.default_first_line} readOnly={readOnly} onClose={() => setEditing(null)} onSaved={after} />}
      {preview && <PreviewDialog lead={preview.lead} kind={preview.kind} readOnly={readOnly} onClose={() => setPreview(null)} />}
    </div>
  );
}
