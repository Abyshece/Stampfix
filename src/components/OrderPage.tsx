import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Minus, Plus, ShoppingBag, X, Check, ChefHat, BellRing, UtensilsCrossed, Info } from 'lucide-react';
import {
  fetchPublicMenu, placeOrder, fetchOrderStatus, menuMoney, isTableNumber,
  type PublicMenu, type GuestOrderStatus, type PlaceOrderError,
} from '../lib/ordering';

// Guest page behind a table QR code: /order/<campaignId>?table=4&loc=<locationId>.
// Pick items, send the order, then follow it (received, preparing, ready).
// Payment happens at the counter.

const STATUS_POLL_MS = 5000;
const storeKey = (campaignId: string) => `sf_order_${campaignId}`;

function savedToken(campaignId: string): string | null {
  try { return localStorage.getItem(storeKey(campaignId)); } catch { return null; }
}
function saveToken(campaignId: string, token: string | null) {
  try {
    if (token) localStorage.setItem(storeKey(campaignId), token);
    else localStorage.removeItem(storeKey(campaignId));
  } catch { /* the status page then only lasts this visit */ }
}

export function OrderPage() {
  const { t, i18n } = useTranslation();
  const campaignId = window.location.pathname.split('/')[2] ?? '';
  const params = new URLSearchParams(window.location.search);
  const urlTable = (params.get('table') ?? '').trim().slice(0, 40) || null;
  const locationId = params.get('loc');

  // Guests get their phone's language (German or English), not the dashboard's.
  useEffect(() => {
    const langs = (navigator.languages ?? [navigator.language]).map((l) => (l || '').toLowerCase());
    void i18n.changeLanguage(langs.some((l) => l.startsWith('de')) ? 'de' : 'en');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [menu, setMenu] = useState<PublicMenu | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sheet, setSheet] = useState(false);
  const [token, setToken] = useState<string | null>(() => savedToken(campaignId));

  const loadMenu = useCallback(() => {
    fetchPublicMenu(campaignId).then((m) => { setMenu(m); setLoadError(false); }).catch(() => setLoadError(true));
  }, [campaignId]);
  useEffect(() => { loadMenu(); }, [loadMenu]);

  const money = useMemo(() => menuMoney(menu?.country ?? null, i18n.language), [menu?.country, i18n.language]);
  const lang = i18n.language?.startsWith('de') ? 'de' : 'en';

  if (token) {
    return (
      <Shell lang={lang} onLang={(l) => void i18n.changeLanguage(l)} title={menu?.businessName}>
        <OrderStatusView token={token} money={money}
          onOrderMore={() => { saveToken(campaignId, null); setToken(null); setCart({}); loadMenu(); }} />
      </Shell>
    );
  }

  if (menu === undefined && !loadError) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }
  if (loadError || menu === null || !menu) {
    return (
      <Shell lang={lang} onLang={(l) => void i18n.changeLanguage(l)}>
        <div className="text-center py-20 px-6">
          <UtensilsCrossed className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium text-[#37352F]">
            {loadError ? t('order.loadErr', { defaultValue: "Couldn't load the menu. Please try again." }) : t('order.notFound', { defaultValue: 'This menu doesn’t exist.' })}
          </p>
          {loadError && <button onClick={loadMenu} className="mt-4 text-sm font-medium underline">{t('order.retry', { defaultValue: 'Try again' })}</button>}
        </div>
      </Shell>
    );
  }

  const itemsById = new Map(menu.items.map((i) => [i.id, i]));
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && itemsById.has(id));
  const count = lines.reduce((n, [, q]) => n + q, 0);
  const total = lines.reduce((n, [id, q]) => n + (itemsById.get(id)!.price * q), 0);
  const setQty = (id: string, q: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, q)) }));

  const groups = [
    ...menu.categories.map((c) => ({ id: c.id, name: c.name, items: menu.items.filter((i) => i.categoryId === c.id) })),
    { id: 'other', name: t('order.other', { defaultValue: 'More' }), items: menu.items.filter((i) => !i.categoryId || !menu.categories.some((c) => c.id === i.categoryId)) },
  ].filter((g) => g.items.length > 0);

  return (
    <Shell lang={lang} onLang={(l) => void i18n.changeLanguage(l)} title={menu.businessName} logo={menu.logoImage} table={urlTable}>
      {!menu.open && (
        <div className="mx-4 mt-4 rounded-xl bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          {t('order.closed', { defaultValue: 'The shop isn’t taking orders here right now. Please order at the counter.' })}
        </div>
      )}
      {menu.note && (
        <div className="mx-4 mt-4 flex gap-2 rounded-xl bg-[#F7F7F5] px-4 py-3 text-sm text-[#37352F]"><Info className="w-4 h-4 mt-0.5 shrink-0" /><span className="break-words">{menu.note}</span></div>
      )}

      {groups.length > 1 && (
        <nav className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b notion-border mt-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-2.5">
            {groups.map((g) => (
              <button key={g.id} onClick={() => document.getElementById(`cat-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="shrink-0 px-3 py-1.5 rounded-full border notion-border text-sm text-[#37352F] bg-white">{g.name}</button>
            ))}
          </div>
        </nav>
      )}

      {groups.length === 0 ? (
        <p className="text-center text-gray-400 py-16 px-6">{t('order.empty', { defaultValue: 'The menu is empty right now.' })}</p>
      ) : (
        <div className="px-4 pb-32">
          {groups.map((g) => (
            <section key={g.id} id={`cat-${g.id}`} className="pt-6 scroll-mt-14">
              <h2 className="text-lg font-semibold text-[#37352F] mb-2">{g.name}</h2>
              <div className="divide-y divide-gray-100">
                {g.items.map((item) => {
                  const q = cart[item.id] ?? 0;
                  return (
                    <div key={item.id} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[#37352F] break-words">{item.name}</div>
                        {item.description && <div className="text-sm text-gray-500 mt-0.5 break-words">{item.description}</div>}
                        <div className="text-sm font-semibold text-[#37352F] mt-1">{money(item.price)}</div>
                      </div>
                      {menu.open && (q === 0 ? (
                        <button onClick={() => setQty(item.id, 1)} aria-label={t('order.add', { defaultValue: 'Add' })}
                          className="shrink-0 w-10 h-10 rounded-full bg-[#37352F] text-white flex items-center justify-center"><Plus className="w-5 h-5" /></button>
                      ) : (
                        <Stepper value={q} onChange={(n) => setQty(item.id, n)} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {menu.open && count > 0 && !sheet && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-white via-white to-white/0">
          <button onClick={() => setSheet(true)}
            className="w-full max-w-lg mx-auto flex items-center justify-between gap-3 bg-[#37352F] text-white rounded-2xl px-5 py-4 shadow-lg">
            <span className="flex items-center gap-2 font-semibold"><ShoppingBag className="w-5 h-5" />{t('order.viewOrder', { defaultValue: 'View order' })}</span>
            <span className="text-sm">{t('order.itemsCount', { count, defaultValue: 'Items: {{count}}' })} · <b>{money(total)}</b></span>
          </button>
        </div>
      )}

      {sheet && (
        <CheckoutSheet menu={menu} lines={lines} total={total} money={money} urlTable={urlTable} campaignId={campaignId} locationId={locationId}
          onQty={setQty} onClose={() => setSheet(false)}
          onPlaced={(tok) => { saveToken(campaignId, tok); setToken(tok); setSheet(false); setCart({}); }}
          onMenuChanged={loadMenu} />
      )}
    </Shell>
  );
}

function Shell({ children, title, logo, table, lang, onLang }: {
  children: React.ReactNode; title?: string; logo?: string | null; table?: string | null; lang: 'en' | 'de'; onLang: (l: 'en' | 'de') => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-white text-[#37352F]">
      <div className="max-w-lg mx-auto">
        <header className="flex items-center gap-3 px-4 pt-5">
          {logo && /^(https?:|data:image\/)/.test(logo) && <img src={logo} alt="" className="w-10 h-10 rounded-lg object-cover border notion-border" />}
          <div className="min-w-0 flex-1">
            {title && <h1 className="text-xl font-semibold truncate">{title}</h1>}
            {table && <div className="text-sm text-gray-500">{isTableNumber(table) ? t('order.tableN', { table, defaultValue: 'Table {{table}}' }) : table}</div>}
          </div>
          <button onClick={() => onLang(lang === 'de' ? 'en' : 'de')} className="text-xs font-semibold px-2.5 py-1.5 rounded-full border notion-border text-gray-600">
            {lang === 'de' ? 'EN' : 'DE'}
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 flex items-center gap-2 bg-[#F7F7F5] rounded-full p-1">
      <button onClick={() => onChange(value - 1)} aria-label={t('order.less', { defaultValue: 'One less' })}
        className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm"><Minus className="w-4 h-4" /></button>
      <span className="w-5 text-center font-semibold tabular-nums">{value}</span>
      <button onClick={() => onChange(value + 1)} disabled={value >= 20} aria-label={t('order.more', { defaultValue: 'One more' })}
        className="w-8 h-8 rounded-full bg-[#37352F] text-white flex items-center justify-center disabled:opacity-40"><Plus className="w-4 h-4" /></button>
    </div>
  );
}

function CheckoutSheet({ menu, lines, total, money, urlTable, campaignId, locationId, onQty, onClose, onPlaced, onMenuChanged }: {
  menu: PublicMenu; lines: Array<[string, number]>; total: number; money: (n: number) => string; urlTable: string | null;
  campaignId: string; locationId: string | null; onQty: (id: string, q: number) => void; onClose: () => void;
  onPlaced: (token: string) => void; onMenuChanged: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [table, setTable] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = new Map(menu.items.map((i) => [i.id, i]));

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await placeOrder({
        campaignId, table: urlTable ?? (table.trim() || null), locationId, name, note,
        items: lines.map(([id, qty]) => ({ id, qty })),
      });
      onPlaced(r.token);
    } catch (e) {
      const code = (e as { code?: PlaceOrderError }).code ?? 'unknown';
      setError({
        ordering_closed: t('order.errClosed', { defaultValue: 'The shop just stopped taking orders here. Please order at the counter.' }),
        too_many_orders: t('order.errTooMany', { defaultValue: 'Please wait a minute before sending another order.' }),
        item_unavailable: t('order.errUnavailable', { defaultValue: 'Something in your order just sold out. Please check your order.' }),
        invalid_items: t('order.errInvalid', { defaultValue: 'Please check your order and try again.' }),
        unknown: t('order.errUnknown', { defaultValue: "Couldn't send your order. Please try again." }),
      }[code]);
      if (code === 'item_unavailable' || code === 'ordering_closed') onMenuChanged();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={() => !sending && onClose()} />
      <div className="relative bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto w-full max-w-lg mx-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 pt-5 pb-3 border-b notion-border">
          <h2 className="text-lg font-semibold">{t('order.yourOrder', { defaultValue: 'Your order' })}</h2>
          <button onClick={onClose} disabled={sending} className="p-1.5 rounded-full hover:bg-[#F7F7F5]" aria-label={t('order.close', { defaultValue: 'Close' })}><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {lines.map(([id, q]) => {
            const it = items.get(id)!;
            return (
              <div key={id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium break-words">{it.name}</div>
                  <div className="text-sm text-gray-500">{money(it.price * q)}</div>
                </div>
                <Stepper value={q} onChange={(n) => onQty(id, n)} />
              </div>
            );
          })}
          <div className="flex justify-between font-semibold text-lg pt-3 border-t notion-border">
            <span>{t('order.total', { defaultValue: 'Total' })}</span><span>{money(total)}</span>
          </div>

          {!urlTable && (
            <input value={table} maxLength={40} onChange={(e) => setTable(e.target.value)}
              className="w-full border notion-border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#37352F]/10"
              placeholder={t('order.tablePh', { defaultValue: 'Table number (optional)' })} />
          )}
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="given-name"
            className="w-full border notion-border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#37352F]/10"
            placeholder={t('order.namePh', { defaultValue: 'Your name (optional)' })} />
          <textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)}
            className="w-full border notion-border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#37352F]/10 resize-none"
            placeholder={t('order.notePh', { defaultValue: 'Anything we should know? (optional)' })} />

          <p className="text-sm text-gray-600 bg-[#F7F7F5] rounded-xl px-4 py-3">{t('order.payAtCounter', { defaultValue: 'You pay at the counter, as usual.' })}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={() => void send()} disabled={sending || lines.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-[#37352F] text-white rounded-2xl px-5 py-4 font-semibold disabled:opacity-50">
            {sending && <Loader2 className="w-5 h-5 animate-spin" />}{t('order.send', { defaultValue: 'Send order' })} · {money(total)}
          </button>
          <p className="text-[11px] text-gray-400 text-center">
            {t('order.privacy', { defaultValue: 'Your name and note are only shared with this shop to prepare your order.' })}
          </p>
        </div>
      </div>
    </div>
  );
}

function OrderStatusView({ token, money, onOrderMore }: { token: string; money: (n: number) => string; onOrderMore: () => void }) {
  const { t } = useTranslation();
  const [st, setSt] = useState<GuestOrderStatus | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let live = true;
    let first = true;
    const poll = () => {
      fetchOrderStatus(token)
        .then((s) => {
          if (!live) return;
          // Scanning the table again later shows the menu, not yesterday's order.
          if (first) {
            first = false;
            const age = s ? Date.now() - new Date(s.createdAt).getTime() : Infinity;
            const done = s && (s.status === 'completed' || s.status === 'rejected');
            if (!s || age > 4 * 60 * 60 * 1000 || (done && age > 30 * 60 * 1000)) { onOrderMore(); return; }
          }
          setSt(s);
          if (s && (s.status === 'new' || s.status === 'accepted' || s.status === 'ready')) timer.current = setTimeout(poll, STATUS_POLL_MS);
        })
        .catch(() => { if (live) timer.current = setTimeout(poll, STATUS_POLL_MS * 2); });
    };
    poll();
    return () => { live = false; if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (st === undefined) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  if (st === null) {
    return (
      <div className="text-center py-20 px-6">
        <p className="font-medium">{t('order.statusGone', { defaultValue: 'We couldn’t find this order.' })}</p>
        <button onClick={onOrderMore} className="mt-4 text-sm font-medium underline">{t('order.backToMenu', { defaultValue: 'Back to the menu' })}</button>
      </div>
    );
  }

  const steps: Array<{ key: string; label: string; icon: typeof Check }> = [
    { key: 'new', label: t('order.stReceived', { defaultValue: 'Received' }), icon: Check },
    { key: 'accepted', label: t('order.stPreparing', { defaultValue: 'Being prepared' }), icon: ChefHat },
    { key: 'ready', label: t('order.stReady', { defaultValue: 'Ready' }), icon: BellRing },
  ];
  const reached = st.status === 'completed' ? 3 : st.status === 'ready' ? 3 : st.status === 'accepted' ? 2 : st.status === 'new' ? 1 : 0;
  const headline = {
    new: t('order.hNew', { defaultValue: 'Order sent! The team will confirm it in a moment.' }),
    accepted: t('order.hAccepted', { defaultValue: 'Your order is being prepared.' }),
    ready: t('order.hReady', { defaultValue: 'Your order is ready!' }),
    completed: t('order.hCompleted', { defaultValue: 'Enjoy! Your order has been served.' }),
    rejected: t('order.hRejected', { defaultValue: 'Sorry, the shop couldn’t accept this order.' }),
  }[st.status];

  return (
    <div className="px-4 py-6 pb-12">
      <div className={`rounded-3xl p-6 text-center ${st.status === 'rejected' ? 'bg-red-50' : st.status === 'ready' ? 'bg-green-50' : 'bg-[#F7F7F5]'}`}>
        <div className="text-sm text-gray-500">{t('order.yourNumber', { defaultValue: 'Your order number' })}</div>
        <div className="text-6xl font-bold tracking-tight mt-1">#{st.number}</div>
        {st.table && <div className="text-sm text-gray-500 mt-1">{isTableNumber(st.table) ? t('order.tableN', { table: st.table, defaultValue: 'Table {{table}}' }) : st.table}</div>}
        <p className="font-semibold mt-4">{headline}</p>
        {st.status === 'rejected' && st.rejectReason && <p className="text-sm text-gray-600 mt-1 break-words">{st.rejectReason}</p>}
      </div>

      {st.status !== 'rejected' && (
        <ol className="flex justify-between mt-6 px-2">
          {steps.map((s, i) => {
            const on = i < reached;
            const Icon = s.icon;
            return (
              <li key={s.key} className="flex flex-col items-center gap-1.5 flex-1 text-center">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center ${on ? 'bg-[#37352F] text-white' : 'bg-gray-100 text-gray-400'}`}><Icon className="w-5 h-5" /></span>
                <span className={`text-xs ${on ? 'text-[#37352F] font-medium' : 'text-gray-400'}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-6 border notion-border rounded-2xl p-4">
        <ul className="space-y-1.5">
          {st.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{it.quantity}× {it.name}</span><span className="text-gray-500 shrink-0">{money(it.price * it.quantity)}</span></li>
          ))}
        </ul>
        <div className="flex justify-between font-semibold mt-3 pt-3 border-t notion-border"><span>{t('order.total', { defaultValue: 'Total' })}</span><span>{money(st.total)}</span></div>
        {st.status !== 'rejected' && <p className="text-xs text-gray-500 mt-2">{t('order.payAtCounter', { defaultValue: 'You pay at the counter, as usual.' })}</p>}
      </div>

      {st.status !== 'new' && st.status !== 'accepted' && (
        <button onClick={onOrderMore} className="mt-6 w-full bg-[#37352F] text-white rounded-2xl px-5 py-4 font-semibold">
          {t('order.orderMore', { defaultValue: 'Order something else' })}
        </button>
      )}
      {(st.status === 'new' || st.status === 'accepted') && (
        <p className="text-center text-xs text-gray-400 mt-6">{t('order.keepOpen', { defaultValue: 'This page updates by itself. You can keep it open.' })}</p>
      )}
    </div>
  );
}
