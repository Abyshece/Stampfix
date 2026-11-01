import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader2, Check, X, ChefHat, BellRing, ChevronDown, Puzzle } from 'lucide-react';
import type { Location } from '../types';
import { useToast } from './ToastProvider';
import { listOrders, setOrderStatus, menuMoney, isTableNumber, type Order, type OrderStatus } from '../lib/ordering';

const POLL_MS = 5000;

/** A short beep for a new order (no sound file to load). Browsers only allow
 *  it after the page has been clicked once, which a working dashboard has. */
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.start(); o.stop(ctx.currentTime + 0.4);
    o.onended = () => { void ctx.close(); };
  } catch { /* sound is a nice-to-have */ }
}

/**
 * Orders (dashboard): table orders from the digital menu, live. New orders are
 * accepted or rejected, then marked ready, then collected.
 */
export function OrdersPanel({ campaignId, country, locations, orderingEnabled, onOpenAddons, onNewCount }: {
  campaignId: string; country: string | null; locations: Location[]; orderingEnabled: boolean;
  onOpenAddons: () => void; onNewCount: (n: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const money = useMemo(() => menuMoney(country, i18n.language), [country, i18n.language]);
  const tableName = (label: string) => (isTableNumber(label) ? t('dash.orders.table', { table: label, defaultValue: 'Table {{table}}' }) : label);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [, setNow] = useState(Date.now());
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const list = await listOrders(campaignId);
      setOrders(list);
      setFailed(false);
      onNewCount(list.filter((o) => o.status === 'new').length);
      // Beep and highlight orders that arrived since the last look.
      const ids = new Set(list.map((o) => o.id));
      if (seen.current) {
        const arrived = list.filter((o) => o.status === 'new' && !seen.current!.has(o.id)).map((o) => o.id);
        if (arrived.length) { beep(); setFresh((prev) => new Set([...prev, ...arrived])); }
      }
      seen.current = ids;
    } catch {
      setFailed(true);
    }
  }, [campaignId, onNewCount]);

  useEffect(() => {
    void load();
    const h = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 30000); // keeps "5 min ago" current
    return () => { clearInterval(h); clearInterval(tick); };
  }, [load]);

  const act = async (o: Order, status: OrderStatus, reason?: string) => {
    setBusyId(o.id);
    try {
      await setOrderStatus(o.id, status, reason);
      setFresh((prev) => { const n = new Set(prev); n.delete(o.id); return n; });
      await load();
    } catch {
      toast.error(t('dash.orders.actErr', { defaultValue: "Couldn't update the order. Please try again." }));
      await load();
    } finally {
      setBusyId(null);
      setRejecting(null);
    }
  };

  const locName = (id: string | null) => (id && locations.length > 1 ? locations.find((l) => l.id === id)?.name ?? null : null);
  const ago = (iso: string) => {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return min < 1 ? t('dash.orders.justNow', { defaultValue: 'just now' }) : t('dash.orders.minAgo', { count: min, defaultValue: '{{count}} min ago' });
  };
  const clock = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  const cols: Array<{ key: OrderStatus; title: string; empty: string }> = [
    { key: 'new', title: t('dash.orders.colNew', { defaultValue: 'New' }), empty: t('dash.orders.emptyNew', { defaultValue: 'No new orders' }) },
    { key: 'accepted', title: t('dash.orders.colPreparing', { defaultValue: 'Preparing' }), empty: t('dash.orders.emptyPreparing', { defaultValue: 'Nothing being prepared' }) },
    { key: 'ready', title: t('dash.orders.colReady', { defaultValue: 'Ready' }), empty: t('dash.orders.emptyReady', { defaultValue: 'Nothing waiting to be collected' }) },
  ];
  const done = (orders ?? []).filter((o) => o.status === 'completed' || o.status === 'rejected');

  const card = (o: Order) => (
    <div key={o.id} className={`rounded-xl border bg-white p-4 shadow-sm ${fresh.has(o.id) ? 'border-amber-400 ring-2 ring-amber-200' : 'notion-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold text-[#37352F]">#{o.number}{o.tableLabel ? <span className="font-semibold"> · {tableName(o.tableLabel)}</span> : null}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {clock(o.createdAt)} · {ago(o.createdAt)}{locName(o.locationId) ? ` · ${locName(o.locationId)}` : ''}
          </div>
          {o.customerName && <div className="text-sm text-[#37352F] mt-1 break-words">{o.customerName}</div>}
        </div>
        <div className="text-sm font-semibold text-[#37352F] shrink-0">{money(o.total)}</div>
      </div>
      <ul className="mt-3 space-y-1">
        {o.items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 break-words"><span className="font-semibold">{it.quantity}×</span> {it.name}</span>
            <span className="text-gray-500 shrink-0">{money(it.price * it.quantity)}</span>
          </li>
        ))}
      </ul>
      {o.note && <p className="mt-2 text-sm bg-amber-50 text-amber-900 rounded-lg px-3 py-2 break-words">“{o.note}”</p>}
      <div className="flex gap-2 mt-3 flex-wrap">
        {o.status === 'new' && (
          <>
            <button disabled={busyId === o.id} onClick={() => void act(o, 'accepted')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#2a2a28] disabled:opacity-50">
              {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('dash.orders.accept', { defaultValue: 'Accept' })}
            </button>
            <button disabled={busyId === o.id} onClick={() => setRejecting(o)}
              className="inline-flex items-center justify-center gap-1.5 border notion-border px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
              <X className="w-4 h-4" />{t('dash.orders.reject', { defaultValue: 'Reject' })}
            </button>
          </>
        )}
        {o.status === 'accepted' && (
          <>
            <button disabled={busyId === o.id} onClick={() => void act(o, 'ready')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 bg-green-600 text-white px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}{t('dash.orders.markReady', { defaultValue: 'Mark ready' })}
            </button>
            <button disabled={busyId === o.id} onClick={() => setRejecting(o)}
              className="inline-flex items-center justify-center gap-1.5 border notion-border px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
              <X className="w-4 h-4" />{t('dash.orders.reject', { defaultValue: 'Reject' })}
            </button>
          </>
        )}
        {o.status === 'ready' && (
          <button disabled={busyId === o.id} onClick={() => void act(o, 'completed')}
            className="flex-1 inline-flex items-center justify-center gap-1.5 border notion-border bg-white px-3 py-2.5 rounded-lg text-sm font-semibold text-[#37352F] hover:bg-[#F7F7F5] disabled:opacity-50">
            {busyId === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t('dash.orders.collected', { defaultValue: 'Collected / served' })}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="w-6 h-6 text-[#37352F]" />
            <h1 className="text-2xl font-semibold text-[#37352F]">{t('dash.orders.title', { defaultValue: 'Orders' })}</h1>
          </div>
          <p className="text-gray-500">{t('dash.orders.sub', { defaultValue: 'Table orders from your digital menu. This page updates by itself.' })}</p>
        </div>
      </div>

      {!orderingEnabled && (
        <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap rounded-xl bg-amber-50 text-amber-900 px-4 py-3 mb-6 text-sm">
          <span>{t('dash.orders.offNotice', { defaultValue: 'Table ordering is switched off, so guests can’t send new orders.' })}</span>
          <button onClick={onOpenAddons} className="inline-flex items-center gap-1.5 font-medium hover:underline"><Puzzle className="w-4 h-4" />{t('dash.orders.openAddons', { defaultValue: 'Open Add-ons' })}</button>
        </div>
      )}

      {orders === null && !failed && <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>}
      {failed && orders === null && <p className="text-sm text-red-600">{t('dash.orders.loadErr', { defaultValue: "Couldn't load orders. Retrying…" })}</p>}

      {orders !== null && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {cols.map((c) => {
              const list = orders.filter((o) => o.status === c.key).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              return (
                <section key={c.key} className="rounded-2xl bg-[#F7F7F5] p-3 sm:p-4 min-w-0">
                  <h2 className="flex items-center gap-2 font-semibold text-[#37352F] mb-3 px-1">
                    {c.key === 'accepted' ? <ChefHat className="w-4 h-4" /> : c.key === 'ready' ? <BellRing className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
                    {c.title}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.key === 'new' && list.length ? 'bg-amber-500 text-white' : 'bg-white text-gray-500'}`}>{list.length}</span>
                  </h2>
                  <div className="space-y-3">
                    {list.length === 0 ? <p className="text-sm text-gray-400 px-1 py-4">{c.empty}</p> : list.map(card)}
                  </div>
                </section>
              );
            })}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <button onClick={() => setShowDone((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#37352F]">
                <ChevronDown className={`w-4 h-4 transition ${showDone ? 'rotate-180' : ''}`} />
                {t('dash.orders.doneToday', { count: done.length, defaultValue: 'Finished in the last 12 hours ({{count}})' })}
              </button>
              {showDone && (
                <div className="mt-3 divide-y divide-gray-100 border notion-border rounded-xl bg-white">
                  {done.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">#{o.number}</span>
                        {o.tableLabel ? ` · ${tableName(o.tableLabel)}` : ''} · {clock(o.createdAt)}
                        {o.status === 'rejected' && o.rejectReason ? <span className="text-gray-500"> · {o.rejectReason}</span> : null}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span className="text-gray-600">{money(o.total)}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {o.status === 'completed' ? t('dash.orders.stCompleted', { defaultValue: 'Collected' }) : t('dash.orders.stRejected', { defaultValue: 'Rejected' })}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {rejecting && <RejectDialog order={rejecting} busy={busyId === rejecting.id} onCancel={() => setRejecting(null)} onReject={(r) => void act(rejecting, 'rejected', r)} />}
    </div>
  );
}

function RejectDialog({ order, busy, onCancel, onReject }: { order: Order; busy: boolean; onCancel: () => void; onReject: (reason: string) => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const quick = [
    t('dash.orders.rSoldOut', { defaultValue: 'Sorry, something is sold out' }),
    t('dash.orders.rClosed', { defaultValue: 'Sorry, the kitchen is closed' }),
    t('dash.orders.rBusy', { defaultValue: 'Sorry, we’re too busy right now' }),
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onCancel()} />
      <div className="relative bg-white rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-xl">
        <h3 className="text-lg font-semibold text-[#37352F]">{t('dash.orders.rejectTitle', { number: order.number, defaultValue: 'Reject order #{{number}}?' })}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('dash.orders.rejectBody', { defaultValue: 'The guest sees this on their phone. Add a short reason (optional).' })}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {quick.map((q) => (
            <button key={q} onClick={() => setReason(q)} className={`text-xs px-2.5 py-1.5 rounded-full border ${reason === q ? 'bg-[#37352F] text-white border-[#37352F]' : 'notion-border text-gray-600 hover:bg-[#F7F7F5]'}`}>{q}</button>
          ))}
        </div>
        <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)}
          className="w-full border notion-border rounded-lg px-3 py-2 text-sm mt-3 focus:outline-none focus:ring-2 focus:ring-[#37352F]/10"
          placeholder={t('dash.orders.reasonPh', { defaultValue: 'Reason (optional)' })} />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-[#F7F7F5]">{t('dash.orders.cancel', { defaultValue: 'Cancel' })}</button>
          <button onClick={() => onReject(reason.trim())} disabled={busy}
            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.orders.reject', { defaultValue: 'Reject' })}
          </button>
        </div>
      </div>
    </div>
  );
}
