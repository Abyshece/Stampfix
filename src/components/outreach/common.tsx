import { useEffect, useState, type ReactNode } from 'react';
import { Globe, MapPin, Phone, Instagram, Mail, Loader2, Send, Trash2 } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { Dialog, inputCls, btnDark, btnLight } from '../addonsUi';
import {
  updateLead, deleteLead, previewEmail, sendTestEmail, mapsUrl, igProfileUrl, countryName, BLOCK_LABEL,
  type Lead, type EmailStatus, type IgStatus, type BlockReason,
} from '../../lib/outreach';

// Shared pieces of Admin > Outreach.

export const EMAIL_STATUS: Record<EmailStatus, [string, string]> = {
  new: ['Not emailed', 'bg-gray-100 text-gray-600'],
  queued: ['Queued', 'bg-blue-50 text-blue-700'],
  sent: ['Emailed', 'bg-indigo-50 text-indigo-700'],
  followup_queued: ['Follow-up queued', 'bg-blue-50 text-blue-700'],
  followed_up: ['Followed up', 'bg-indigo-50 text-indigo-700'],
  replied: ['Replied', 'bg-green-50 text-green-700'],
  not_interested: ['Not interested', 'bg-gray-100 text-gray-500'],
  bounced: ['Bounced', 'bg-red-50 text-red-700'],
  complained: ['Spam report', 'bg-red-50 text-red-700'],
  unsubscribed: ['Unsubscribed', 'bg-gray-100 text-gray-500'],
  skipped: ['Skipped', 'bg-gray-100 text-gray-500'],
};
export const IG_STATUS: Record<IgStatus, [string, string]> = {
  new: ['Not messaged', 'bg-gray-100 text-gray-600'],
  sent: ['Messaged', 'bg-pink-50 text-pink-700'],
  replied: ['Replied', 'bg-green-50 text-green-700'],
  not_interested: ['Not interested', 'bg-gray-100 text-gray-500'],
  skipped: ['Skipped', 'bg-gray-100 text-gray-500'],
};

export function Pill({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{children}</span>;
}

export function flag(cc: string): string {
  return /^[A-Za-z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '';
}

/** Turns a database error into words. */
export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/Not authorised|Forbidden/i.test(m)) return 'Only full admins can do this.';
  if (/duplicate/.test(m)) return 'Another shop in your list already has that email or Instagram.';
  if (/invalid_email/.test(m)) return 'That email address doesn’t look right.';
  if (/email_in_use/.test(m)) return 'This shop was already emailed, so its address can’t change.';
  if (/already_contacted/.test(m)) return 'This shop was already contacted, so it stays in the list.';
  if (/has_email/.test(m)) return 'This shop already has an email address.';
  if (/no_places_key/.test(m)) return 'The free map servers are overloaded right now. Add a free Geoapify key for reliable shop search (see the note above).';
  if (/places_40[13]/.test(m)) return 'The Geoapify key isn’t accepted. Check GEOAPIFY_API_KEY in Supabase (Edge Functions, Secrets).';
  if (/places_429/.test(m)) return 'Today’s free Geoapify searches (3,000) are used up. Try again tomorrow.';
  if (/map_busy|503/.test(m)) return 'The map service is busy right now. Try again in a minute.';
  if (/RESEND_API_KEY/.test(m)) return 'The Resend key isn’t set on the server.';
  return m || 'Something went wrong. Please try again.';
}

/** Name, kind of shop and place, with the links to look it up. */
export function ShopCell({ lead }: { lead: Pick<Lead, 'business_name' | 'category' | 'city' | 'country' | 'region' | 'address' | 'lat' | 'lon'> }) {
  return (
    <div className="min-w-0">
      <div className="font-medium text-[#37352F] break-words">{lead.business_name}</div>
      <div className="text-xs text-gray-500 mt-0.5 break-words">
        {[lead.category, lead.city].filter(Boolean).join(' · ')} {flag(lead.country)} <span title={countryName(lead.country)}>{lead.country}</span>
      </div>
    </div>
  );
}

export function LinkIcons({ lead }: { lead: Pick<Lead, 'business_name' | 'address' | 'city' | 'lat' | 'lon' | 'website' | 'phone' | 'instagram' | 'email'> }) {
  const a = 'p-1.5 rounded-md text-gray-400 hover:text-[#37352F] hover:bg-[#F1F1EF]';
  return (
    <div className="flex items-center gap-0.5">
      <a className={a} href={mapsUrl(lead)} target="_blank" rel="noopener noreferrer" title="Open in Google Maps (reviews, photos)"><MapPin className="w-4 h-4" /></a>
      {lead.website && <a className={a} href={lead.website} target="_blank" rel="noopener noreferrer" title={lead.website}><Globe className="w-4 h-4" /></a>}
      {lead.instagram && <a className={a} href={igProfileUrl(lead.instagram)} target="_blank" rel="noopener noreferrer" title={`@${lead.instagram}`}><Instagram className="w-4 h-4" /></a>}
      {lead.email && <a className={a} href={`mailto:${lead.email}`} title={lead.email}><Mail className="w-4 h-4" /></a>}
      {lead.phone && <a className={a} href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} title={lead.phone}><Phone className="w-4 h-4" /></a>}
    </div>
  );
}

export function BlockPill({ reason }: { reason: BlockReason | null }) {
  if (!reason) return null;
  return <Pill cls="bg-amber-50 text-amber-800">{BLOCK_LABEL[reason]}</Pill>;
}

/** Edit a shop: the personal first line, email, Instagram and notes. */
export function LeadEditDialog({ lead, defaultFirstLine, readOnly, onClose, onSaved }: {
  lead: Lead; defaultFirstLine: string; readOnly: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [firstLine, setFirstLine] = useState(lead.first_line ?? '');
  const [email, setEmail] = useState(lead.email ?? '');
  const [instagram, setInstagram] = useState(lead.instagram ?? '');
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fallback = defaultFirstLine
    .replace('{business}', lead.business_name).replace('{city}', lead.city || 'your area').replace('{category}', lead.category || 'local shops');

  const save = async () => {
    setBusy(true);
    try {
      await updateLead(lead.id, { first_line: firstLine, email, instagram, notes });
      toast.success('Saved');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deleteLead(lead.id);
      toast.success('Removed from your list');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const label = 'block text-xs font-medium text-gray-500 mb-1';
  return (
    <Dialog title={lead.business_name} onClose={onClose}>
      <div className="px-5 space-y-4">
        <div>
          <label className={label} htmlFor="ol-first">Personal first line</label>
          <textarea id="ol-first" rows={3} maxLength={300} value={firstLine} onChange={(e) => setFirstLine(e.target.value)} disabled={readOnly}
            className={`${inputCls} resize-none`} placeholder={fallback} />
          <p className="text-xs text-gray-500 mt-1">Something true and specific, e.g. their Google rating or a drink people rave about. Blank uses: “{fallback}”</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="ol-email">Email</label>
            <input id="ol-email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={readOnly} className={inputCls} placeholder="info@shop.com" />
            {lead.email_source && <p className="text-[11px] text-gray-500 mt-1 break-all">Found: {/^https?:/.test(lead.email_source)
              ? <a className="underline" href={lead.email_source} target="_blank" rel="noopener noreferrer">{lead.email_source}</a> : lead.email_source}</p>}
          </div>
          <div>
            <label className={label} htmlFor="ol-ig">Instagram</label>
            <input id="ol-ig" value={instagram} onChange={(e) => setInstagram(e.target.value)} disabled={readOnly} className={inputCls} placeholder="@shopname" />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="ol-notes">Notes</label>
          <textarea id="ol-notes" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} className={`${inputCls} resize-none`} />
        </div>
      </div>
      <div className="flex items-center gap-2 px-5 py-4 mt-5 border-t notion-border">
        {!readOnly && (confirmDelete ? (
          <span className="flex items-center gap-1 mr-auto">
            <button type="button" className="px-2.5 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium" disabled={busy} onClick={() => void remove()}>Remove</button>
            <button type="button" className="px-2 py-1.5 rounded-md text-sm text-gray-500" onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="mr-auto inline-flex items-center gap-1 text-sm text-red-600 hover:underline">
            <Trash2 className="w-4 h-4" />Remove
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button type="button" className={btnLight} onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && <button type="button" className={btnDark} disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Save</button>}
        </div>
      </div>
    </Dialog>
  );
}

/** The exact email a shop would get, with a test send to our own inbox. */
export function PreviewDialog({ lead, kind, readOnly, onClose }: { lead: Lead; kind: 'first' | 'followup'; readOnly: boolean; onClose: () => void }) {
  const toast = useToast();
  const [pv, setPv] = useState<Awaited<ReturnType<typeof previewEmail>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => { previewEmail(lead.id, kind).then(setPv).catch((e) => setErr(errorText(e))); }, [lead.id, kind]);
  const test = async () => {
    setSending(true);
    try {
      const r = await sendTestEmail(lead.id, kind);
      toast.success(`Test sent to ${r.to}`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog title={kind === 'followup' ? 'Follow-up email' : 'Email preview'} onClose={onClose}>
      <div className="px-5 pb-2">
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!pv && !err && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>}
        {pv && (
          <>
            {pv.blocked && pv.blocked !== 'no_email' && <div className="mb-3"><BlockPill reason={pv.blocked} /></div>}
            <dl className="text-sm grid grid-cols-[64px_1fr] gap-y-1">
              <dt className="text-gray-500">From</dt><dd className="break-all">{pv.from_name} &lt;hello@stampfix.app&gt;</dd>
              <dt className="text-gray-500">To</dt><dd className="break-all">{pv.to ?? '—'}</dd>
              <dt className="text-gray-500">Subject</dt><dd className="font-medium break-words">{pv.subject}</dd>
            </dl>
            <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-[#37352F] bg-[#F7F7F5] rounded-lg p-3 max-h-[50vh] overflow-y-auto">{pv.body}</pre>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 mt-3 border-t notion-border">
        <button type="button" className={btnLight} onClick={onClose}>Close</button>
        {!readOnly && pv && (
          <button type="button" className={btnDark} disabled={sending} onClick={() => void test()}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Send test to hello@stampfix.app
          </button>
        )}
      </div>
    </Dialog>
  );
}

/** A row of filter buttons with counts. */
export function FilterChips<T extends string>({ value, options, onChange }: {
  value: T; options: Array<{ id: T; label: string; count?: number }>; onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-full text-sm border transition ${value === o.id ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border text-gray-600 hover:bg-[#F7F7F5]'}`}>
          {o.label}{o.count != null && <span className={`ml-1.5 text-xs ${value === o.id ? 'text-white/70' : 'text-gray-400'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
