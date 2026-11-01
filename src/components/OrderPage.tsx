import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Minus, Plus, ShoppingBag, X, Check, ChefHat, BellRing, UtensilsCrossed, Info, ArrowRight, Wallet } from 'lucide-react';
import {
  fetchPublicMenu, placeOrder, fetchOrderStatus, menuMoney, isTableNumber,
  type PublicMenu, type GuestOrderStatus, type PlaceOrderError,
} from '../lib/ordering';
import { getCampaignById } from '../lib/db';
import type { Campaign } from '../types';

// Guest page behind a table QR code: /order/<campaignId>?table=4&loc=<locationId>.
// Pick items, send the order, then follow it (received, preparing, ready).
// Payment happens at the counter. A banner invites guests to the shop's
// stamp card (opens the normal sign-up in a new tab, so the order stays).

const STATUS_POLL_MS = 5000;
const storeKey = (campaignId: string) => `sf_order_${campaignId}`;
const hideKey = (campaignId: string) => `sf_loyalty_hide_${campaignId}`;

const PAGE_BG = '#FAF7F2';
const INK = '#2F2A26';

function savedToken(campaignId: string): string | null {
  try { return localStorage.getItem(storeKey(campaignId)); } catch { return null; }
}
function saveToken(campaignId: string, token: string | null) {
  try {
    if (token) localStorage.setItem(storeKey(campaignId), token);
    else localStorage.removeItem(storeKey(campaignId));
  } catch { /* the status page then only lasts this visit */ }
}

// ---- Colours ------------------------------------------------------------------------

const HEX = /^#?([0-9a-fA-F]{6})$/;
function lum(color: string | null | undefined): number | null {
  const m = color ? HEX.exec(color.trim()) : null;
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
const hexOf = (c: string) => (c.trim().startsWith('#') ? c.trim() : `#${c.trim()}`);

type Accent = { bg: string; ink: string };
/** The shop's colour for buttons; our warm ink when it's missing or too pale for a button. */
function accentOf(color: string | null | undefined): Accent {
  const l = lum(color);
  if (l === null || l > 200) return { bg: INK, ink: '#FFFFFF' };
  return { bg: hexOf(color!), ink: l > 150 ? '#1A1A1A' : '#FFFFFF' };
}

/** Banner colours: the shop's poster colour (solid or gradient) or its brand colour, with readable text. */
function bannerTheme(c: Campaign, accent: Accent) {
  const poster = (c.posterColor ?? '').trim();
  const isGradient = /gradient\(/i.test(poster);
  const posterLum = lum(poster);
  const glow = 'radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,0.28), rgba(255,255,255,0) 55%)';
  let style: CSSProperties;
  let l: number;
  if (isGradient) {
    style = { background: poster };
    const stops = [...poster.matchAll(/#([0-9a-fA-F]{6})/g)].map((m) => lum(m[0]) ?? 0);
    l = stops.length ? stops.reduce((a, b) => a + b, 0) / stops.length : 0;
  } else if (posterLum !== null && posterLum <= 245) {
    // A plain white poster wouldn't stand out on this page, so it falls through to the brand colour.
    style = { backgroundColor: hexOf(poster), backgroundImage: glow };
    l = posterLum;
  } else {
    style = { backgroundColor: accent.bg, backgroundImage: glow };
    l = lum(accent.bg) ?? 0;
  }
  const ink = l > 150 ? '#1A1A1A' : '#FFFFFF';
  // White card on a coloured banner; a dark card when the banner itself is very light (as on the posters).
  const cardBg = l > 225 ? '#111318' : '#FFFFFF';
  return { style, ink, ctaInk: ink === '#FFFFFF' ? '#1A1A1A' : '#FFFFFF', cardBg, cardInk: cardBg === '#FFFFFF' ? '#1A1A1A' : '#FFFFFF' };
}

// ---- Page ------------------------------------------------------------------------------

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
  // The shop's stamp card, for the sign-up banner (only when the card is live).
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loyaltyHidden, setLoyaltyHidden] = useState(() => { try { return localStorage.getItem(hideKey(campaignId)) === '1'; } catch { return false; } });

  const loadMenu = useCallback(() => {
    fetchPublicMenu(campaignId).then((m) => { setMenu(m); setLoadError(false); }).catch(() => setLoadError(true));
  }, [campaignId]);
  useEffect(() => { loadMenu(); }, [loadMenu]);
  useEffect(() => {
    let live = true;
    getCampaignById(campaignId)
      .then((c) => { if (live) setCampaign(c && c.approvalStatus === 'approved' ? c : null); })
      .catch(() => { /* no banner */ });
    return () => { live = false; };
  }, [campaignId]);

  const money = useMemo(() => menuMoney(menu?.country ?? null, i18n.language), [menu?.country, i18n.language]);
  const accent = useMemo(() => accentOf(menu?.primaryColor ?? campaign?.primaryColor), [menu?.primaryColor, campaign?.primaryColor]);
  const lang = i18n.language?.startsWith('de') ? 'de' : 'en';
  const onLang = (l: 'en' | 'de') => void i18n.changeLanguage(l);
  const joinUrl = `/?campaign=${encodeURIComponent(campaignId)}${locationId ? `&location=${encodeURIComponent(locationId)}` : ''}`;
  const hideLoyalty = () => { setLoyaltyHidden(true); try { localStorage.setItem(hideKey(campaignId), '1'); } catch { /* this visit only */ } };
  const banner = (variant: 'menu' | 'after') => (campaign && !loyaltyHidden
    ? <LoyaltyBanner campaign={campaign} accent={accent} joinUrl={joinUrl} variant={variant} onHide={hideLoyalty} />
    : null);

  if (token) {
    return (
      <Shell lang={lang} onLang={onLang} title={menu?.businessName} logo={menu?.logoImage}>
        <OrderStatusView token={token} money={money} accent={accent} banner={banner('after')}
          onOrderMore={() => { saveToken(campaignId, null); setToken(null); setCart({}); loadMenu(); }} />
      </Shell>
    );
  }

  if (menu === undefined && !loadError) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: PAGE_BG }}><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;
  }
  if (loadError || menu === null || !menu) {
    return (
      <Shell lang={lang} onLang={onLang}>
        <div className="text-center py-20 px-6">
          <UtensilsCrossed className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium">
            {loadError ? t('order.loadErr', { defaultValue: "Couldn't load the menu. Please try again." }) : t('order.notFound', { defaultValue: 'This menu doesn’t exist.' })}
          </p>
          {loadError && <button onClick={loadMenu} className="mt-4 text-sm font-medium underline">{t('order.retry', { defaultValue: 'Try again' })}</button>}
        </div>
      </Shell>
    );
  }

  const setQty = (id: string, q: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, q)) }));
  const itemsById = new Map(menu.items.map((i) => [i.id, i]));
  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && itemsById.has(id));
  const total = lines.reduce((n, [id, q]) => n + (itemsById.get(id)!.price * q), 0);

  return (
    <Shell lang={lang} onLang={onLang} title={menu.businessName} logo={menu.logoImage} table={urlTable}>
      <MenuView menu={menu} cart={cart} money={money} accent={accent} banner={banner('menu')}
        onQty={setQty} onOpenCart={() => setSheet(true)} sheetOpen={sheet} total={total} />
      {sheet && (
        <CheckoutSheet menu={menu} lines={lines} total={total} money={money} accent={accent} urlTable={urlTable} campaignId={campaignId} locationId={locationId}
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
    <div className="min-h-screen" style={{ background: PAGE_BG, color: INK }}>
      <div className="max-w-lg mx-auto">
        <header className="flex items-start gap-3 px-4 pt-6 pb-1">
          {logo && /^(https?:|data:image\/)/.test(logo) && (
            <img src={logo} alt="" className="w-12 h-12 rounded-2xl object-cover bg-white ring-1 ring-black/5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {title && <h1 className="font-serif-display text-[26px] leading-tight font-semibold truncate">{title}</h1>}
            {table && (
              <span className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-white ring-1 ring-black/5 text-gray-600">
                <UtensilsCrossed className="w-3.5 h-3.5" />{isTableNumber(table) ? t('order.tableN', { table, defaultValue: 'Table {{table}}' }) : table}
              </span>
            )}
          </div>
          <button onClick={() => onLang(lang === 'de' ? 'en' : 'de')}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white ring-1 ring-black/5 text-gray-600 shrink-0 mt-1">
            {lang === 'de' ? 'EN' : 'DE'}
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

// ---- Stamp-card banner ------------------------------------------------------------------

function StampShape({ kind, on }: { kind: number; on: boolean }) {
  const base = `w-[22px] h-[22px] ${on ? '' : 'opacity-20'}`;
  if (kind === 0) return <span className={`${base} rounded-[6px] bg-current`} />;
  if (kind === 1) return <span className={`${base} rounded-full bg-current`} />;
  return (
    <span className={`${base} relative`}>
      <i className="absolute left-1/2 top-1/2 w-[118%] h-[5px] rounded bg-current -translate-x-1/2 -translate-y-1/2 rotate-45" />
      <i className="absolute left-1/2 top-1/2 w-[118%] h-[5px] rounded bg-current -translate-x-1/2 -translate-y-1/2 -rotate-45" />
    </span>
  );
}

/** Rounded banner in the shop's colours with its stamp card peeking out at the bottom, like the posters. */
function LoyaltyBanner({ campaign, accent, joinUrl, variant, onHide }: {
  campaign: Campaign; accent: Accent; joinUrl: string; variant: 'menu' | 'after'; onHide: () => void;
}) {
  const { t } = useTranslation();
  const th = bannerTheme(campaign, accent);
  const stamps = Math.min(Math.max(campaign.maxStamps || 6, 1), 12);
  const name = campaign.businessName;
  const logo = campaign.logoImage && /^(https?:|data:image\/)/.test(campaign.logoImage) ? campaign.logoImage : null;
  return (
    <div className="relative">
      <a href={joinUrl} target="_blank" rel="noopener noreferrer"
        className="block relative overflow-hidden rounded-[28px] shadow-lg shadow-black/10 active:scale-[0.99] transition-transform"
        style={{ ...th.style, color: th.ink }}>
        <div className="relative z-10 px-5 pt-5 pb-[104px]">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] opacity-75">{t('order.loyaltyLabel', { defaultValue: 'Stamp card' })}</div>
          <div className="font-serif-display text-[22px] leading-tight font-semibold mt-1 pr-8">
            {variant === 'menu'
              ? t('order.loyaltyTitle', { business: name, defaultValue: 'Collect stamps at {{business}}' })
              : t('order.loyaltyAfterTitle', { defaultValue: 'Get a stamp for this order' })}
          </div>
          <p className="text-sm mt-1.5 opacity-90 pr-4">
            {variant === 'menu'
              ? (campaign.offerTitle || t('order.loyaltyFallback', { defaultValue: 'Fill your card and get a reward.' }))
              : t('order.loyaltyAfterHint', { defaultValue: 'Sign up for the stamp card and collect your stamp when you pay.' })}
          </p>
          <span className="inline-flex items-center gap-1.5 mt-4 rounded-full px-4 py-2 text-sm font-semibold shadow-sm" style={{ background: th.ink, color: th.ctaInk }}>
            {t('order.loyaltyCta', { defaultValue: 'Sign up free' })}<ArrowRight className="w-4 h-4" />
          </span>
        </div>
        {/* The card itself, only its top half showing. */}
        {/* A one-row card (6 stamps or fewer) is shorter, so it sits higher to keep its stamps in view. */}
        <div aria-hidden className="absolute left-1/2 bottom-0 w-[86%] max-w-[330px] rounded-[20px] px-4 pt-3.5 pb-14"
          style={{ background: th.cardBg, color: th.cardInk, transform: `translate(-50%, ${stamps <= 6 ? 30 : 48}%)`, boxShadow: '0 -6px 18px rgba(0,0,0,0.14), 0 -22px 48px rgba(0,0,0,0.18)' }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {logo
                ? <img src={logo} alt="" className="w-6 h-6 rounded-md object-cover shrink-0" />
                : <span className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black shrink-0" style={{ background: th.cardInk, color: th.cardBg }}>{name.slice(0, 1).toUpperCase()}</span>}
              <span className="text-[13px] font-extrabold uppercase tracking-wide truncate">{name}</span>
            </div>
            <div className="text-right leading-none shrink-0">
              <div className="text-[8px] font-bold uppercase tracking-wider opacity-60">{t('order.stamps', { defaultValue: 'Stamps' })}</div>
              <div className="text-lg font-extrabold mt-0.5">{stamps}</div>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-x-2 gap-y-2.5 mt-3.5 justify-items-center">
            {Array.from({ length: stamps }, (_, i) => <StampShape key={i} kind={i % 3} on={i < 3} />)}
          </div>
        </div>
      </a>
      <button onClick={onHide} aria-label={t('order.loyaltyHide', { defaultValue: 'Hide' })}
        className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: th.ink === '#FFFFFF' ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.55)', color: th.ink }}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ---- Menu -----------------------------------------------------------------------------------

function MenuView({ menu, cart, money, accent, banner, onQty, onOpenCart, sheetOpen, total }: {
  menu: PublicMenu; cart: Record<string, number>; money: (n: number) => string; accent: Accent; banner: React.ReactNode;
  onQty: (id: string, q: number) => void; onOpenCart: () => void; sheetOpen: boolean; total: number;
}) {
  const { t } = useTranslation();
  const count = Object.entries(cart).reduce((n, [id, q]) => n + (menu.items.some((i) => i.id === id) ? q : 0), 0);
  const groups = useMemo(() => [
    ...menu.categories.map((c) => ({ id: c.id, name: c.name, items: menu.items.filter((i) => i.categoryId === c.id) })),
    { id: 'other', name: t('order.other', { defaultValue: 'More' }), items: menu.items.filter((i) => !i.categoryId || !menu.categories.some((c) => c.id === i.categoryId)) },
  ].filter((g) => g.items.length > 0), [menu, t]);

  // Highlight the category chip for the section you're looking at.
  const [active, setActive] = useState<string | null>(null);
  const chipBar = useRef<HTMLDivElement>(null);
  const groupKey = groups.map((g) => g.id).join(',');
  useEffect(() => {
    if (groups.length < 2 || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (seen[0]) setActive(seen[0].target.id.slice(4));
    }, { rootMargin: '-72px 0px -55% 0px' });
    groups.forEach((g) => { const el = document.getElementById(`cat-${g.id}`); if (el) obs.observe(el); });
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);
  useEffect(() => {
    const bar = chipBar.current;
    const chip = active ? bar?.querySelector<HTMLElement>(`[data-chip="${active}"]`) : null;
    if (bar && chip) bar.scrollTo({ left: chip.offsetLeft - 16, behavior: 'smooth' });
  }, [active]);

  return (
    <>
      {banner && <div className="px-4 mt-4">{banner}</div>}
      {!menu.open && (
        <div className="mx-4 mt-4 rounded-2xl bg-amber-50 text-amber-900 ring-1 ring-amber-200/60 px-4 py-3 text-sm">
          {t('order.closed', { defaultValue: 'The shop isn’t taking orders here right now. Please order at the counter.' })}
        </div>
      )}
      {menu.note && (
        <div className="mx-4 mt-4 flex gap-2.5 rounded-2xl bg-white ring-1 ring-black/5 px-4 py-3 text-sm">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" /><span className="break-words">{menu.note}</span>
        </div>
      )}

      {groups.length > 1 && (
        <nav className="sticky top-0 z-10 mt-4 border-b border-black/5" style={{ background: PAGE_BG }}>
          <div ref={chipBar} className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-3">
            {groups.map((g) => {
              const on = active === g.id;
              return (
                <button key={g.id} data-chip={g.id}
                  onClick={() => document.getElementById(`cat-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${on ? 'shadow-sm' : 'bg-white ring-1 ring-black/5 text-gray-600'}`}
                  style={on ? { background: accent.bg, color: accent.ink } : undefined}>
                  {g.name}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {groups.length === 0 ? (
        <p className="text-center text-gray-400 py-16 px-6">{t('order.empty', { defaultValue: 'The menu is empty right now.' })}</p>
      ) : (
        <div className="px-4 pb-36">
          {groups.map((g) => (
            <section key={g.id} id={`cat-${g.id}`} className="pt-6 scroll-mt-16">
              <h2 className="font-serif-display text-xl font-semibold mb-3">{g.name}</h2>
              <div className="space-y-2.5">
                {g.items.map((item) => {
                  const q = cart[item.id] ?? 0;
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5 transition-shadow"
                      style={q > 0 ? { boxShadow: `0 0 0 2px ${accent.bg}` } : undefined}>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold break-words leading-snug">{item.name}</div>
                        {item.description && <div className="text-sm text-gray-500 mt-0.5 break-words line-clamp-2">{item.description}</div>}
                        <div className="text-[15px] font-semibold mt-1.5 tabular-nums">{money(item.price)}</div>
                      </div>
                      {menu.open && (q === 0 ? (
                        <button onClick={() => onQty(item.id, 1)} aria-label={t('order.add', { defaultValue: 'Add' })}
                          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition"
                          style={{ background: accent.bg, color: accent.ink }}><Plus className="w-5 h-5" /></button>
                      ) : (
                        <Stepper value={q} accent={accent} onChange={(n) => onQty(item.id, n)} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {menu.open && count > 0 && !sheetOpen && (
        <div className="fixed bottom-0 inset-x-0 px-4 pb-4 pt-8 pointer-events-none" style={{ background: `linear-gradient(to top, ${PAGE_BG} 55%, ${PAGE_BG}00)` }}>
          <button onClick={onOpenCart}
            className="pointer-events-auto w-full max-w-lg mx-auto flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 shadow-lg shadow-black/15 active:scale-[0.99] transition"
            style={{ background: accent.bg, color: accent.ink }}>
            <span className="flex items-center gap-3 min-w-0">
              <span className="relative shrink-0">
                <ShoppingBag className="w-6 h-6" />
                <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold flex items-center justify-center"
                  style={{ background: accent.ink, color: accent.bg }}>{count}</span>
              </span>
              <span className="text-left leading-tight">
                <span className="block font-semibold">{t('order.viewOrder', { defaultValue: 'View order' })}</span>
                <span className="block text-xs opacity-80">{t('order.itemsCount', { count, defaultValue: 'Items: {{count}}' })}</span>
              </span>
            </span>
            <span className="font-bold tabular-nums">{money(total)}</span>
          </button>
        </div>
      )}
    </>
  );
}

function Stepper({ value, accent, onChange }: { value: number; accent: Accent; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0 flex items-center gap-1.5 rounded-full p-1" style={{ background: PAGE_BG }}>
      <button onClick={() => onChange(value - 1)} aria-label={t('order.less', { defaultValue: 'One less' })}
        className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm ring-1 ring-black/5"><Minus className="w-4 h-4" /></button>
      <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
      <button onClick={() => onChange(value + 1)} disabled={value >= 20} aria-label={t('order.more', { defaultValue: 'One more' })}
        className="w-8 h-8 rounded-full flex items-center justify-center disabled:opacity-40 shadow-sm"
        style={{ background: accent.bg, color: accent.ink }}><Plus className="w-4 h-4" /></button>
    </div>
  );
}

// ---- Checkout -------------------------------------------------------------------------------

function CheckoutSheet({ menu, lines, total, money, accent, urlTable, campaignId, locationId, onQty, onClose, onPlaced, onMenuChanged }: {
  menu: PublicMenu; lines: Array<[string, number]>; total: number; money: (n: number) => string; accent: Accent; urlTable: string | null;
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
  const field = 'w-full rounded-xl bg-white ring-1 ring-black/10 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black/20';

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
      <div className="relative rounded-t-[28px] max-h-[92vh] overflow-y-auto w-full max-w-lg mx-auto pb-safe" style={{ background: PAGE_BG, color: INK }}>
        <div className="sticky top-0 z-10 px-5 pt-3 pb-3" style={{ background: PAGE_BG }}>
          <div className="w-10 h-1 rounded-full bg-black/15 mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="font-serif-display text-xl font-semibold">{t('order.yourOrder', { defaultValue: 'Your order' })}</h2>
            <button onClick={onClose} disabled={sending} className="w-9 h-9 rounded-full bg-white ring-1 ring-black/5 flex items-center justify-center" aria-label={t('order.close', { defaultValue: 'Close' })}><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <div className="rounded-2xl bg-white ring-1 ring-black/5 divide-y divide-black/5">
            {lines.map(([id, q]) => {
              const it = items.get(id)!;
              return (
                <div key={id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words">{it.name}</div>
                    <div className="text-sm text-gray-500 tabular-nums">{money(it.price * q)}</div>
                  </div>
                  <Stepper value={q} accent={accent} onChange={(n) => onQty(id, n)} />
                </div>
              );
            })}
            <div className="flex justify-between font-semibold text-lg px-4 py-3">
              <span>{t('order.total', { defaultValue: 'Total' })}</span><span className="tabular-nums">{money(total)}</span>
            </div>
          </div>

          {!urlTable && (
            <input value={table} maxLength={40} onChange={(e) => setTable(e.target.value)} className={field}
              placeholder={t('order.tablePh', { defaultValue: 'Table number (optional)' })} />
          )}
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="given-name" className={field}
            placeholder={t('order.namePh', { defaultValue: 'Your name (optional)' })} />
          <textarea value={note} maxLength={300} rows={2} onChange={(e) => setNote(e.target.value)} className={`${field} resize-none`}
            placeholder={t('order.notePh', { defaultValue: 'Anything we should know? (optional)' })} />

          <p className="flex items-center gap-2 text-sm text-gray-600 px-1"><Wallet className="w-4 h-4 shrink-0 text-gray-400" />{t('order.payAtCounter', { defaultValue: 'You pay at the counter, as usual.' })}</p>
          {error && <p className="text-sm text-red-600 px-1">{error}</p>}
          <button onClick={() => void send()} disabled={sending || lines.length === 0}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-5 py-4 font-semibold shadow-lg shadow-black/10 disabled:opacity-50 active:scale-[0.99] transition"
            style={{ background: accent.bg, color: accent.ink }}>
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

// ---- After ordering ---------------------------------------------------------------------------

function OrderStatusView({ token, money, accent, banner, onOrderMore }: {
  token: string; money: (n: number) => string; accent: Accent; banner: React.ReactNode; onOrderMore: () => void;
}) {
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
  const tone = st.status === 'rejected' ? 'bg-red-50 ring-red-100' : st.status === 'ready' ? 'bg-green-50 ring-green-100' : 'bg-white ring-black/5';

  return (
    <div className="px-4 py-5 pb-12 space-y-4">
      <div className={`rounded-[28px] p-6 text-center ring-1 ${tone}`}>
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">{t('order.yourNumber', { defaultValue: 'Your order number' })}</div>
        <div className="text-7xl font-extrabold tracking-tight mt-1 tabular-nums">#{st.number}</div>
        {st.table && <div className="text-sm text-gray-500 mt-1">{isTableNumber(st.table) ? t('order.tableN', { table: st.table, defaultValue: 'Table {{table}}' }) : st.table}</div>}
        <p className="font-serif-display text-lg font-semibold mt-4">{headline}</p>
        {st.status === 'rejected' && st.rejectReason && <p className="text-sm text-gray-600 mt-1 break-words">{st.rejectReason}</p>}

        {st.status !== 'rejected' && (
          <ol className="flex justify-between mt-6 relative">
            <span className="absolute top-5 left-[16%] right-[16%] h-0.5 bg-black/10" aria-hidden />
            <span className="absolute top-5 left-[16%] h-0.5 transition-all" aria-hidden
              style={{ background: accent.bg, width: `${Math.max(0, reached - 1) * 34}%` }} />
            {steps.map((s, i) => {
              const on = i < reached;
              const Icon = s.icon;
              return (
                <li key={s.key} className="relative flex flex-col items-center gap-1.5 flex-1 text-center">
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center ${on ? '' : 'bg-gray-100 text-gray-400'}`}
                    style={on ? { background: accent.bg, color: accent.ink } : undefined}><Icon className="w-5 h-5" /></span>
                  <span className={`text-xs ${on ? 'font-semibold' : 'text-gray-400'}`}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-black/5 p-4">
        <ul className="space-y-1.5">
          {st.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{it.quantity}× {it.name}</span><span className="text-gray-500 shrink-0 tabular-nums">{money(it.price * it.quantity)}</span></li>
          ))}
        </ul>
        <div className="flex justify-between font-semibold mt-3 pt-3 border-t border-black/5"><span>{t('order.total', { defaultValue: 'Total' })}</span><span className="tabular-nums">{money(st.total)}</span></div>
        {st.status !== 'rejected' && <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-2"><Wallet className="w-3.5 h-3.5" />{t('order.payAtCounter', { defaultValue: 'You pay at the counter, as usual.' })}</p>}
      </div>

      {st.status !== 'rejected' && banner}

      {st.status !== 'new' && st.status !== 'accepted' && (
        <button onClick={onOrderMore} className="w-full rounded-2xl px-5 py-4 font-semibold shadow-lg shadow-black/10" style={{ background: accent.bg, color: accent.ink }}>
          {t('order.orderMore', { defaultValue: 'Order something else' })}
        </button>
      )}
      {(st.status === 'new' || st.status === 'accepted') && (
        <p className="text-center text-xs text-gray-400">{t('order.keepOpen', { defaultValue: 'This page updates by itself. You can keep it open.' })}</p>
      )}
    </div>
  );
}
