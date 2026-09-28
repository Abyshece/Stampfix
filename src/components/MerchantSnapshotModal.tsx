import { useEffect, useState } from 'react';
import { Loader2, X, ExternalLink, Check, Minus } from 'lucide-react';
import { fetchMerchantSnapshot, type MerchantSnapshot } from '../services/admin';
import { WalletLivePreview } from './WalletLivePreview';

const ONBOARDING_STEPS: Array<[keyof MerchantSnapshot['merchant']['onboarding_state'], string]> = [
  ['wizard_dismissed', 'Finished the setup wizard'],
  ['poster_downloaded', 'Downloaded the QR poster'],
  ['test_signup_done', 'Tried the customer sign-up'],
  ['first_stamp_given', 'Gave a first stamp'],
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[#F7F7F5] border notion-border rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400">{label}</div>
      <div className="text-xl font-bold mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border notion-border rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs py-1 border-b notion-border last:border-0">
      <span className="text-gray-500 whitespace-nowrap">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  );
}

const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : '—');

/** "View as merchant": a read-only picture of one merchant's account — their
 *  card, settings, locations, staff, numbers, activity and customers. Built
 *  from one admin query; nothing here can change their account. */
export function MerchantSnapshotModal({ merchantId, onClose }: { merchantId: string; onClose: () => void }) {
  const [snap, setSnap] = useState<MerchantSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMerchantSnapshot(merchantId)
      .then((s) => { if (live) { if (s) setSnap(s); else setErr('Merchant not found.'); } })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : 'Could not load this merchant'); });
    return () => { live = false; };
  }, [merchantId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const m = snap?.merchant;
  const c = snap?.campaign;
  const joinUrl = c ? `${window.location.origin}/?campaign=${c.id}` : null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-stretch md:items-center justify-center md:p-6" onClick={onClose}>
      <div role="dialog" aria-label="View as merchant" className="bg-[#FBFBFA] w-full max-w-5xl md:rounded-xl shadow-2xl overflow-y-auto max-h-full" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-white border-b notion-border px-5 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest font-bold text-amber-700">View as merchant · read-only</div>
            <div className="font-semibold truncate">
              {m ? `${m.business_name || '—'} ` : 'Loading…'}
              {m && <span className="font-mono text-xs text-gray-400">{m.merchant_code}</span>}
            </div>
            {m && (
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                <span>{m.email}</span>
                <span>· {m.plan.toUpperCase()}{m.is_comped ? ' (comped)' : ''}</span>
                <span>· {m.status}</span>
                {m.country && <span>· {m.country}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded hover:bg-[#F7F7F5]"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        {err ? (
          <div className="p-6 text-sm text-red-600">{err}</div>
        ) : !snap || !m ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">This is what the merchant has set up and what their customers see. Nothing on this screen can change their account.</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Active customers" value={snap.stats.customers_active} />
              <Stat label="Stamps (7 days)" value={snap.stats.stamps_7d} />
              <Stat label="Stamps (30 days)" value={snap.stats.stamps_30d} />
              <Stat label="Stamps (all time)" value={snap.stats.stamps_total} />
              <Stat label="Rewards redeemed" value={snap.stats.rewards_total} />
              <Stat label="In Apple Wallet" value={snap.stats.in_apple_wallet} />
              <Stat label="Joined (30 days)" value={snap.stats.joins_30d} />
              <Stat label="Last activity" value={snap.stats.last_activity_at ? new Date(snap.stats.last_activity_at).toLocaleDateString() : 'Never'} />
            </div>

            {!c ? (
              <Section title="Loyalty card">
                <div className="text-sm text-gray-500">They haven’t created their loyalty card yet.</div>
              </Section>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Section title="Their card, as customers see it">
                  <WalletLivePreview
                    note="Their current card design (Apple Wallet and Google Wallet layouts)."
                    settings={{
                      businessName: c.business_name,
                      offerTitle: c.offer_title,
                      maxStamps: c.max_stamps,
                      backgroundColor: c.background_color,
                      cardTextColor: c.card_text_color,
                      logoColor: c.logo_color,
                      logoText: c.logo_text,
                      logoImage: c.logo_image,
                      logoMode: c.logo_mode ?? 'stampfix',
                    }}
                  />
                </Section>
                <div className="space-y-4">
                  <Section title="Program settings">
                    <Row label="Reward" value={c.offer_title} />
                    <Row label="Stamps for a reward" value={c.max_stamps} />
                    <Row label="Stamps per customer per day" value={c.max_stamps_per_day ? c.max_stamps_per_day : 'No limit'} />
                    <Row label="How stamps are given" value={c.stamping_mode === 'self_serve' ? `Customer scans the counter QR (within ${c.self_serve_radius ?? 100} m)` : 'Staff scan the customer’s card'} />
                    <Row label="Cashier code for extra stamps" value={c.has_stamp_code ? 'Set' : 'Not set'} />
                    <Row label="Owner PIN" value={c.has_owner_pin ? 'Set' : 'Not set'} />
                    <Row label="Approval" value={<span>{c.approval_status ?? 'approved'}{c.rejection_reason ? ` — ${c.rejection_reason}` : ''}</span>} />
                    <Row label="Card created" value={when(c.created_at)} />
                    <Row label="Last changed" value={when(c.updated_at)} />
                    {joinUrl && (
                      <Row label="Customer sign-up page" value={
                        <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      } />
                    )}
                  </Section>
                  <Section title="Getting started">
                    <ul className="space-y-1">
                      {ONBOARDING_STEPS.map(([k, label]) => {
                        const done = k === 'first_stamp_given' ? (m.onboarding_state?.[k] || snap.stats.stamps_total > 0) : m.onboarding_state?.[k];
                        return (
                          <li key={k} className="flex items-center gap-2 text-xs">
                            {done ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Minus className="w-3.5 h-3.5 text-gray-300" />}
                            <span className={done ? 'text-gray-800' : 'text-gray-400'}>{label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </Section>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Section title={`Locations (${snap.locations.length})`}>
                {snap.locations.length === 0 ? <div className="text-xs text-gray-400 italic">None added.</div> : (
                  <ul className="space-y-1.5">
                    {snap.locations.map((l) => (
                      <li key={l.id} className="text-xs flex justify-between gap-3">
                        <span className={l.archived ? 'text-gray-400 line-through' : ''}>{l.name}{l.address ? <span className="text-gray-400"> · {l.address}</span> : null}</span>
                        <span className="text-gray-400 whitespace-nowrap">{l.has_coordinates ? 'on the map' : 'no map pin'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title={`Staff (${snap.staff.length})`}>
                {snap.staff.length === 0 ? <div className="text-xs text-gray-400 italic">No staff accounts.</div> : (
                  <ul className="space-y-1.5">
                    {snap.staff.map((s, i) => (
                      <li key={i} className="text-xs flex justify-between gap-3">
                        <span className={s.active ? '' : 'text-gray-400'}>{s.name}{!s.active && ' (inactive)'}</span>
                        <span className="text-gray-400 whitespace-nowrap">last login {s.last_login_at ? new Date(s.last_login_at).toLocaleDateString() : 'never'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <Section title="Recent activity">
              {snap.recent_activity.length === 0 ? <div className="text-xs text-gray-400 italic">No activity yet.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-400 text-left"><tr><th className="py-1 pr-3">Time</th><th className="py-1 pr-3">Type</th><th className="py-1 pr-3">Customer</th><th className="hidden sm:table-cell py-1 pr-3">Where / who</th><th className="hidden sm:table-cell py-1">Note</th></tr></thead>
                    <tbody>
                      {snap.recent_activity.map((a, i) => (
                        <tr key={i} className="border-t notion-border">
                          <td className="py-1 pr-3 sm:whitespace-nowrap text-gray-500">{new Date(a.created_at).toLocaleString()}</td>
                          <td className="py-1 pr-3">{a.type}</td>
                          <td className="py-1 pr-3">
                            {a.customer_name ?? '—'}
                            {/* Phones: where / who and the note, under the customer */}
                            <div className="sm:hidden text-gray-500">
                              {[a.location_name, a.staff_name, a.source].filter(Boolean).join(' · ')}
                              {a.is_override ? ` · Extra stamp${a.reason ? `: ${a.reason}` : ''}` : (a.reason ? ` · ${a.reason}` : '')}
                            </div>
                          </td>
                          <td className="hidden sm:table-cell py-1 pr-3 text-gray-500">{[a.location_name, a.staff_name, a.source].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="hidden sm:table-cell py-1 text-gray-500">{a.is_override ? `Extra stamp${a.reason ? `: ${a.reason}` : ''}` : (a.reason ?? '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title={`Customers (latest ${snap.customers.length})`}>
              {snap.customers.length === 0 ? <div className="text-xs text-gray-400 italic">No customers yet.</div> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-400 text-left"><tr><th className="py-1 pr-3">Name</th><th className="hidden sm:table-cell py-1 pr-3">Email</th><th className="py-1 pr-3">Stamps</th><th className="py-1 pr-3">Rewards</th><th className="py-1 pr-3">Status</th><th className="hidden sm:table-cell py-1">Joined</th></tr></thead>
                    <tbody>
                      {snap.customers.map((cu, i) => (
                        <tr key={i} className="border-t notion-border">
                          <td className="py-1 pr-3">
                            {cu.customer_name || '—'} <span className="text-gray-400 font-mono">{cu.customer_code}</span>
                            {/* Phones: email and join date, under the name */}
                            <div className="sm:hidden text-gray-500 break-all">{cu.email}</div>
                            <div className="sm:hidden text-gray-400">joined {new Date(cu.joined_at).toLocaleDateString()}</div>
                          </td>
                          <td className="hidden sm:table-cell py-1 pr-3 text-gray-500">{cu.email}</td>
                          <td className="py-1 pr-3">{cu.current_stamps}/{cu.max_stamps ?? '?'}</td>
                          <td className="py-1 pr-3">{cu.rewards_redeemed}</td>
                          <td className="py-1 pr-3">{cu.deletion_pending ? 'deletion pending' : cu.status.toLowerCase()}</td>
                          <td className="hidden sm:table-cell py-1 whitespace-nowrap text-gray-500">{new Date(cu.joined_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="Notifications in their bell">
              {snap.notifications.length === 0 ? <div className="text-xs text-gray-400 italic">None.</div> : (
                <ul className="space-y-1.5">
                  {snap.notifications.map((n, i) => (
                    <li key={i} className="text-xs flex justify-between gap-3">
                      <span>{n.title}</span>
                      <span className="text-gray-400 whitespace-nowrap">{new Date(n.created_at).toLocaleDateString()} · {n.read ? 'read' : 'unread'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
