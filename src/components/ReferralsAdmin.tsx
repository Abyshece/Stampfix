import { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, Loader2, ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { useToast } from './ToastProvider';
import { Dialog, inputCls, btnDark, btnLight } from './addonsUi';
import { Pill } from './outreach/common';
import {
  adminListReferrals, adminApproveReferral, adminRejectReferral, adminLinkReferral, adminCreditReferrals, FLAG_REASON,
  type ReferralRow, type ReferralReward, type ReferralStatus,
} from '../lib/referrals';

const STATUS: Record<ReferralStatus, [string, string]> = {
  signed_up: ['Signed up', 'bg-gray-100 text-gray-600'],
  flagged: ['Needs a look', 'bg-amber-50 text-amber-800'],
  rewarded: ['Went Pro: rewarded', 'bg-green-50 text-green-700'],
  rejected: ['Rejected', 'bg-red-50 text-red-700'],
};
type Filter = 'all' | ReferralStatus;

const money = (cents: number, cur: string) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${cur.toUpperCase()}`; }
};
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const reasonText = (r: string | null) => {
  if (!r) return null;
  const approved = r.startsWith('approved: ');
  const key = approved ? r.slice(10) : r;
  const words = FLAG_REASON[key] ?? key;
  return approved ? `Approved anyway (${words.toLowerCase()})` : words;
};

function rewardText(w: ReferralReward | undefined, status: ReferralStatus): [string, string] {
  if (!w) {
    if (status === 'signed_up') return ['Waits for their first payment', 'bg-gray-100 text-gray-600'];
    if (status === 'flagged') return ['On hold: needs a look', 'bg-amber-50 text-amber-800'];
    return ['No month', 'bg-gray-100 text-gray-500'];
  }
  if (w.status === 'credited') return [`Credited ${w.amount_cents && w.currency ? money(w.amount_cents, w.currency) : ''}`.trim(), 'bg-green-50 text-green-700'];
  if (w.status === 'capped') return ['Not given: 12 this year', 'bg-gray-100 text-gray-500'];
  if (w.status === 'cancelled') return ['Cancelled', 'bg-gray-100 text-gray-500'];
  if (w.error) return ['Failed, retrying', 'bg-red-50 text-red-700'];
  return [w.has_customer ? 'Waiting to go on Stripe' : 'Waiting (no Stripe account yet)', 'bg-blue-50 text-blue-700'];
}

/**
 * Admin > Referrals: which shop invited which, where each invite stands and
 * the free months given. Flagged invites (looks like the same owner) wait
 * here for Approve or Reject.
 */
export function ReferralsAdmin({ readOnly }: { readOnly: boolean }) {
  const toast = useRef(useToast()).current;
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReferralRow | null>(null);
  const [approving, setApproving] = useState<ReferralRow | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    adminListReferrals().then((r) => { setRows(r); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const words = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e ?? '');
    if (/Not authorised|Forbidden/i.test(m)) return 'Only full admins can do this.';
    if (/code_not_found/.test(m)) return 'No shop has that invite code.';
    if (/shop_not_found/.test(m)) return 'No shop with that email.';
    if (/same_shop/.test(m)) return 'A shop can’t invite itself.';
    if (/already_invited/.test(m)) return 'That shop already has an inviter.';
    if (/HTTP 404|Failed to send a request/i.test(m)) return 'The referral-credit function isn’t deployed yet.';
    return m || 'Something went wrong. Please try again.';
  };

  const creditNow = async () => {
    setBusy('credit');
    try {
      const r = await adminCreditReferrals();
      if (r.failed.length) toast.error(`${r.credited} put on Stripe, ${r.failed.length} failed: ${r.failed[0].error}`);
      else toast.success(r.credited ? `${r.credited} free month${r.credited === 1 ? '' : 's'} put on Stripe` : 'Nothing waiting to go on Stripe');
    } catch (e) { toast.error(words(e)); }
    setBusy(null);
    load();
  };

  if (err && !rows) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold text-[#37352F] mb-2">Referrals</h1>
        <p className="text-sm text-red-600">{words(err)}</p>
        <p className="text-sm text-gray-500 mt-2">If this is the first time, the referrals database update may not be applied yet.</p>
      </div>
    );
  }
  if (!rows) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

  const rewards = rows.flatMap((r) => r.rewards);
  const credited = rewards.filter((w) => w.status === 'credited');
  const cost = credited.reduce<Record<string, number>>((acc, w) => {
    if (w.amount_cents && w.currency) acc[w.currency] = (acc[w.currency] ?? 0) + w.amount_cents;
    return acc;
  }, {});
  const waiting = rewards.filter((w) => w.status === 'pending');
  const count = (s: ReferralStatus) => rows.filter((r) => r.status === s).length;
  const shown = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2"><Gift className="w-5 h-5 text-[#37352F]" /><h1 className="text-2xl font-semibold text-[#37352F]">Referrals</h1></div>
          <p className="text-gray-500 mt-1 text-sm max-w-2xl">
            Pro shops invite other shops with their link. When the invited shop pays for Pro, both get 1 month free as a credit on their Stripe bill.
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={btnLight} onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add by hand</button>
            <button type="button" className={btnDark} onClick={creditNow} disabled={busy === 'credit'}>
              {busy === 'credit' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Credit now
            </button>
          </div>
        )}
      </header>

      <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          ['Invites', String(rows.length)],
          ['Went Pro', String(count('rewarded'))],
          ['Needs a look', String(count('flagged'))],
          ['Months given', String(credited.length)],
          ['Months waiting', String(waiting.length)],
          ['Cost so far', Object.entries(cost).map(([c, v]) => money(v, c)).join(' + ') || money(0, 'eur')],
        ] as const).map(([k, v]) => (
          <div key={k} className="bg-white border notion-border rounded-xl px-3 py-2.5 min-w-0">
            <dt className="text-xs text-gray-500">{k}</dt>
            <dd className="text-lg font-semibold text-[#37352F] tabular-nums break-words" data-stat={k}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-1.5 flex-wrap">
        {([['all', 'All', rows.length], ['flagged', 'Needs a look', count('flagged')], ['signed_up', 'Signed up', count('signed_up')],
          ['rewarded', 'Rewarded', count('rewarded')], ['rejected', 'Rejected', count('rejected')]] as const).map(([id, label, n]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-full border transition ${filter === id ? 'bg-[#37352F] text-white border-[#37352F]' : 'bg-white notion-border text-gray-600 hover:bg-[#F7F7F5]'}`}>
            {label} <span className="opacity-70">{n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white border notion-border rounded-xl px-5 py-8 text-center">
          {rows.length === 0 ? 'No invites yet. Pro shops see the invite pill under their scanner.' : 'Nothing here.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => {
            const [label, cls] = STATUS[r.status];
            const inviter = rewardText(r.rewards.find((w) => w.role === 'referrer'), r.status);
            const invited = rewardText(r.rewards.find((w) => w.role === 'referred'), r.status);
            const stripeErr = r.rewards.find((w) => w.error && w.status === 'pending')?.error;
            return (
              <li key={r.id} className="bg-white border notion-border rounded-xl p-4" data-referral-row={r.referred_name ?? ''}>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-2 items-start flex-1 min-w-[240px]">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-gray-400">Invited by</div>
                      <div className="font-medium text-[#37352F] break-words">{r.referrer_name || (r.referrer_id ? '(no name)' : 'Deleted shop')}</div>
                      <div className="text-xs text-gray-500 break-all">{[r.referrer_code, r.referrer_email].filter(Boolean).join(' · ')}</div>
                      <div className="mt-1.5"><Pill cls={inviter[1]}>{inviter[0]}</Pill></div>
                    </div>
                    <ArrowRight className="hidden sm:block w-4 h-4 text-gray-300 mt-5" />
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wide text-gray-400">New shop</div>
                      <div className="font-medium text-[#37352F] break-words">{r.referred_name || '(no name)'}</div>
                      <div className="text-xs text-gray-500 break-all">{[r.referred_code, r.referred_email, r.referred_plan === 'pro' ? 'Pro' : 'Free'].filter(Boolean).join(' · ')}</div>
                      <div className="mt-1.5"><Pill cls={invited[1]}>{invited[0]}</Pill></div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-auto">
                    <Pill cls={cls}>{label}</Pill>
                    <div className="text-[11px] text-gray-400 mt-1">Signed up {day(r.created_at)}{r.source === 'admin' ? ' (added by hand)' : ''}</div>
                    {r.paid_at && <div className="text-[11px] text-gray-400">First payment {day(r.paid_at)}</div>}
                  </div>
                </div>
                {(r.reason || stripeErr) && (
                  <div className="mt-3 text-xs space-y-1">
                    {r.reason && <p className={r.status === 'flagged' ? 'text-amber-800 bg-amber-50 rounded px-2 py-1.5' : 'text-gray-500'}>{reasonText(r.reason)}</p>}
                    {stripeErr && <p className="text-red-700 bg-red-50 rounded px-2 py-1.5 break-words">Stripe: {stripeErr}</p>}
                  </div>
                )}
                {!readOnly && r.status !== 'rewarded' && (
                  <div className="mt-3 flex gap-2 justify-end flex-wrap">
                    {r.status !== 'rejected' && <button type="button" className={btnLight} onClick={() => setRejecting(r)}>Reject</button>}
                    {(r.status === 'flagged' || r.status === 'rejected') && <button type="button" className={btnDark} onClick={() => setApproving(r)}>Approve: give both months</button>}
                  </div>
                )}
                {!readOnly && r.status === 'rewarded' && r.rewards.some((w) => w.status === 'pending') && (
                  <div className="mt-3 flex justify-end">
                    <button type="button" className="text-xs text-gray-500 underline" onClick={() => setRejecting(r)}>Cancel the months still waiting</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {approving && (
        <Dialog title="Give both months?" onClose={() => setApproving(null)}>
          <p className="px-5 text-sm text-gray-600">
            {approving.referrer_name || 'The inviting shop'} and {approving.referred_name || 'the new shop'} each get 1 month of Pro free.
            {approving.reason && ` It was flagged: ${reasonText(approving.reason)?.toLowerCase()}.`}
          </p>
          <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
            <button type="button" className={btnLight} onClick={() => setApproving(null)}>Cancel</button>
            <button type="button" className={btnDark} disabled={busy === approving.id} onClick={async () => {
              setBusy(approving.id);
              try {
                await adminApproveReferral(approving.id);
                setApproving(null);
                toast.success('Approved. Putting the months on Stripe…');
                await creditNow();
              } catch (e) { toast.error(words(e)); setBusy(null); load(); }
            }}>{busy === approving.id && <Loader2 className="w-4 h-4 animate-spin" />}Approve</button>
          </div>
        </Dialog>
      )}
      {rejecting && <RejectDialog row={rejecting} onClose={() => setRejecting(null)} onDone={(msg) => { setRejecting(null); toast.success(msg); load(); }} onError={(e) => toast.error(words(e))} />}
      {adding && <AddDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast.success('Invite added. It counts at the shop’s next Pro payment.'); load(); }} words={words} />}
    </div>
  );
}

function RejectDialog({ row, onClose, onDone, onError }: { row: ReferralRow; onClose: () => void; onDone: (msg: string) => void; onError: (e: unknown) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Reject this invite?" onClose={onClose}>
      <div className="px-5 space-y-3">
        <p className="text-sm text-gray-600">No free months for it. Months already on Stripe stay there.</p>
        <label className="block text-xs font-medium text-gray-600" htmlFor="ref-reason">Reason (only you see it)</label>
        <input id="ref-reason" className={inputCls} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. same owner" />
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
        <button type="button" className={btnLight} onClick={onClose}>Cancel</button>
        <button type="button" disabled={busy} className="inline-flex items-center gap-1.5 bg-red-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40"
          onClick={async () => {
            setBusy(true);
            try { await adminRejectReferral(row.id, reason.trim()); onDone('Invite rejected'); }
            catch (e) { onError(e); setBusy(false); }
          }}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Reject</button>
      </div>
    </Dialog>
  );
}

function AddDialog({ onClose, onDone, words }: { onClose: () => void; onDone: () => void; words: (e: unknown) => string }) {
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title="Add an invite by hand" onClose={onClose}>
      <div className="px-5 space-y-3">
        <p className="text-sm text-gray-600">For a shop that was invited but signed up without the link.</p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="ref-code">Inviting shop’s code (the 6 letters in its link)</label>
          <input id="ref-code" className={`${inputCls} uppercase`} value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="K7Q2MX" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="ref-email">New shop’s login email</label>
          <input id="ref-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@shop.com" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
        <button type="button" className={btnLight} onClick={onClose}>Cancel</button>
        <button type="button" className={btnDark} disabled={busy || code.trim().length !== 6 || !email.includes('@')}
          onClick={async () => {
            setBusy(true); setError(null);
            try { await adminLinkReferral(code.trim(), email.trim()); onDone(); }
            catch (e) { setError(words(e)); setBusy(false); }
          }}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Add invite</button>
      </div>
    </Dialog>
  );
}
