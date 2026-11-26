import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, Wallet, Stamp, UtensilsCrossed, Globe, Star, ShoppingBag, Bike, Instagram, Facebook, Music2, Linkedin,
  ChevronRight, MapPin, Store,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getPublicBusinessPage, type PublicBusinessPage } from '../lib/businessPage';
import { orderUrl, isTableNumber } from '../lib/ordering';
import { LanguageSwitcher } from './LanguageSwitcher';

// The shop's Business page: stampfix.app/v/<address>[?l=<branch>][&t=<table>].
// One QR code on tables, the door and the counter opens it. From here the
// guest joins the stamp card (or opens theirs), collects a stamp with the
// counter code (self-serve shops), orders (when ordering is on) and finds the
// shop's links. Every button leads into the existing join, stamp and order
// pages, which work exactly as they do from their own QR codes.

const PAGE_BG = '#FAF7F2';
const INK = '#2F2A26';
const HEX = /^#?([0-9a-fA-F]{6})$/;

function lum(color: string | null | undefined): number | null {
  const m = color ? HEX.exec(color.trim()) : null;
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
/** The shop's colour for buttons; our warm ink when it's missing or too pale for a button. */
export function pageAccent(color: string | null | undefined): { bg: string; ink: string } {
  const l = lum(color);
  if (l === null || l > 200) return { bg: INK, ink: '#FFFFFF' };
  const hex = color!.trim().startsWith('#') ? color!.trim() : `#${color!.trim()}`;
  return { bg: hex, ink: l > 150 ? '#1A1A1A' : '#FFFFFF' };
}

/** Only real web links become buttons (never javascript: and the like). */
function safeHref(v: string): string | null {
  const t = v.trim();
  if (/^https?:\/\/[^\s]+$/i.test(t)) return t;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) return `https://${t}`;
  return null;
}

/** The link keys the page shows, in this order (same keys as Links & socials). */
const LINK_ORDER: { key: string; icon: typeof Globe; en: string; tkey: string }[] = [
  { key: 'googleReview', icon: Star, en: 'Leave us a review', tkey: 'cust.page.linkReview' },
  { key: 'website', icon: Globe, en: 'Website', tkey: 'cust.page.linkWebsite' },
  { key: 'order', icon: ShoppingBag, en: 'Order online', tkey: 'cust.page.linkOrder' },
  { key: 'delivery', icon: Bike, en: 'Delivery', tkey: 'cust.page.linkDelivery' },
  { key: 'instagram', icon: Instagram, en: 'Instagram', tkey: 'cust.page.linkInstagram' },
  { key: 'facebook', icon: Facebook, en: 'Facebook', tkey: 'cust.page.linkFacebook' },
  { key: 'tiktok', icon: Music2, en: 'TikTok', tkey: 'cust.page.linkTiktok' },
  { key: 'linkedin', icon: Linkedin, en: 'LinkedIn', tkey: 'cust.page.linkLinkedin' },
];

/** Where each button goes, for a page, a branch and a table. */
export function pageTargets(page: PublicBusinessPage, opts: { locationId?: string | null; table?: string | null; here?: string }) {
  const loc = page.locations.find((l) => l.id === opts.locationId) ?? (page.locations.length === 1 ? page.locations[0] : null);
  const join = `/?campaign=${encodeURIComponent(page.campaignId)}${loc ? `&location=${encodeURIComponent(loc.id)}` : ''}`;
  const stamp = (locationId: string) =>
    `/stamp?campaign=${encodeURIComponent(page.campaignId)}&location=${encodeURIComponent(locationId)}&via=page`
    + (opts.here ? `&back=${encodeURIComponent(opts.here)}` : '');
  // Same as the table codes in Add-ons: the branch only for shops with several.
  const order = page.orderingOpen ? orderUrl(page.campaignId, opts.table || null, page.locations.length > 1 ? loc?.id ?? null : null, '') : null;
  return { loc, join, stamp, order };
}

interface ViewProps {
  page: PublicBusinessPage;
  locationId?: string | null;
  table?: string | null;
  /** The guest already has this shop's card on this phone (signed in). */
  hasCard?: boolean;
  /** The dashboard's live preview: same look, nothing navigates. */
  preview?: boolean;
  /** This address with its query, so the stamp page can come back here. */
  here?: string;
}

/** The page itself; used by the live page and the dashboard preview. */
export function BusinessPageView({ page, locationId, table, hasCard, preview, here }: ViewProps) {
  const { t } = useTranslation();
  const accent = pageAccent(page.primaryColor);
  const { loc, join, stamp, order } = pageTargets(page, { locationId, table, here });
  const [pickBranch, setPickBranch] = useState(false);
  const block = (e: React.MouseEvent) => { if (preview) e.preventDefault(); };
  const links = LINK_ORDER
    .map((l) => ({ ...l, href: page.links[l.key] ? safeHref(page.links[l.key]) : null }))
    .filter((l): l is typeof l & { href: string } => !!l.href);
  const tableLabel = table ? (isTableNumber(table) ? t('cust.page.tableN', { n: table, defaultValue: 'Table {{n}}' }) : table) : null;
  const max = page.maxStamps && page.maxStamps > 0 ? Math.min(page.maxStamps, 12) : null;

  const orderButton = order && (
    <a href={order} onClick={block} data-page-order
      className="flex items-center gap-3 w-full rounded-2xl px-5 py-4 font-semibold shadow-sm"
      style={{ background: accent.bg, color: accent.ink }}>
      <UtensilsCrossed className="w-5 h-5 shrink-0" />
      <span className="flex-1 text-left">{tableLabel
        ? t('cust.page.orderAt', { table: tableLabel, defaultValue: 'Order at {{table}}' })
        : t('cust.page.menuOrder', { defaultValue: 'See the menu and order' })}</span>
      <ChevronRight className="w-5 h-5 shrink-0 opacity-80" />
    </a>
  );

  return (
    <div className="min-h-full w-full" style={{ background: PAGE_BG, color: INK }} data-business-page={page.slug}>
      <div className="mx-auto w-full max-w-md px-5 pt-8 pb-10 space-y-5">
        <header className="text-center space-y-3">
          <div className="mx-auto w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-3xl shadow-sm border border-black/5"
            style={{ background: page.logoImage ? '#FFFFFF' : accent.bg, color: accent.ink }}>
            {page.logoImage
              ? <img src={page.logoImage} alt="" className="w-full h-full object-contain p-2" />
              : page.customIcon
                ? <span aria-hidden="true">{page.customIcon}</span>
                : <Store className="w-8 h-8" aria-hidden="true" />}
          </div>
          <div>
            <h1 className="text-2xl font-serif-display font-semibold leading-tight break-words" data-page-name>{page.businessName}</h1>
            {loc && page.locations.length > 1 && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#6B635B]"><MapPin className="w-3.5 h-3.5" />{loc.name}</p>
            )}
          </div>
          {page.about && <p className="text-[15px] leading-relaxed text-[#5B544D] whitespace-pre-line break-words" data-page-about>{page.about}</p>}
        </header>

        {/* At a table with ordering on, ordering comes first. */}
        {tableLabel && orderButton}

        <section className="rounded-2xl bg-white border border-black/5 shadow-sm p-5 space-y-4" data-page-card>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent.bg, color: accent.ink }}>
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#8A8178]">{t('cust.page.stampCard', { defaultValue: 'Stamp card' })}</div>
              <div className="font-semibold leading-snug break-words">
                {page.offerTitle && page.maxStamps
                  ? t('cust.page.reward', { count: page.maxStamps, reward: page.offerTitle, defaultValue: 'Collect {{count}} stamps, get {{reward}}' })
                  : t('cust.page.rewardPlain', { defaultValue: 'Collect stamps and get a reward' })}
              </div>
            </div>
          </div>
          {max && (
            <div className="flex flex-wrap gap-1.5" aria-hidden="true">
              {Array.from({ length: max }, (_, i) => (
                <span key={i} className="w-5 h-5 rounded-full border-2 opacity-50" style={{ borderColor: accent.bg }} />
              ))}
            </div>
          )}
          <a href={join} onClick={block} data-page-join
            className="block w-full text-center rounded-xl py-3.5 font-semibold"
            style={{ background: accent.bg, color: accent.ink }}>
            {hasCard ? t('cust.page.openCard', { defaultValue: 'Open my card' }) : t('cust.page.getCard', { defaultValue: 'Get your stamp card' })}
          </a>
          {!hasCard && (
            <p className="text-xs text-center text-[#8A8178]">{t('cust.page.noApp', { defaultValue: 'No app needed. It goes in Apple or Google Wallet.' })}</p>
          )}
          {page.selfServe && page.locations.length > 0 && (
            loc ? (
              <a href={stamp(loc.id)} onClick={block} data-page-stamp
                className="flex items-center justify-center gap-2 w-full rounded-xl py-3 font-medium border-2"
                style={{ borderColor: accent.bg, color: INK }}>
                <Stamp className="w-4 h-4" />{t('cust.page.collectStamp', { defaultValue: 'Collect a stamp' })}
              </a>
            ) : !pickBranch ? (
              <button type="button" onClick={() => setPickBranch(true)} data-page-stamp
                className="flex items-center justify-center gap-2 w-full rounded-xl py-3 font-medium border-2"
                style={{ borderColor: accent.bg, color: INK }}>
                <Stamp className="w-4 h-4" />{t('cust.page.collectStamp', { defaultValue: 'Collect a stamp' })}
              </button>
            ) : (
              <div className="space-y-2" data-page-branches>
                <p className="text-sm font-medium text-center">{t('cust.page.whichBranch', { defaultValue: 'Which branch are you at?' })}</p>
                {page.locations.map((l) => (
                  <a key={l.id} href={stamp(l.id)} onClick={block}
                    className="flex items-center gap-2 w-full rounded-xl px-4 py-3 border border-black/10 bg-[#FCFBF9] text-sm font-medium">
                    <MapPin className="w-4 h-4 text-[#8A8178]" /><span className="flex-1 text-left">{l.name}</span><ChevronRight className="w-4 h-4 text-[#8A8178]" />
                  </a>
                ))}
              </div>
            )
          )}
        </section>

        {!tableLabel && orderButton}

        {links.length > 0 && (
          <nav className="rounded-2xl bg-white border border-black/5 shadow-sm divide-y divide-black/5 overflow-hidden" data-page-links>
            {links.map(({ key, icon: Icon, en, tkey, href }) => (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" onClick={block} data-page-link={key}
                className="flex items-center gap-3 px-5 py-3.5 text-[15px] font-medium hover:bg-[#FCFBF9]">
                <Icon className="w-5 h-5 text-[#8A8178] shrink-0" />
                <span className="flex-1 min-w-0 truncate">{t(tkey, { defaultValue: en })}</span>
                <ChevronRight className="w-4 h-4 text-[#B5ADA4] shrink-0" />
              </a>
            ))}
          </nav>
        )}

        <footer className="pt-2 flex items-center justify-between gap-3 text-xs text-[#8A8178]">
          <a href="https://stampfix.app" onClick={block} className="hover:underline">{t('cust.page.poweredBy', { defaultValue: 'Powered by Stampfix' })}</a>
          <div className="flex items-center gap-3">
            <a href="/cardholder-privacy" onClick={block} className="hover:underline">{t('cust.page.privacy', { defaultValue: 'Privacy' })}</a>
            {!preview && <LanguageSwitcher />}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: PAGE_BG, color: INK }}>
      {children}
    </div>
  );
}

/** Route component for /v/<address>. */
export function BusinessPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const slug = useMemo(() => decodeURIComponent(window.location.pathname.slice(3).split('/')[0] || '').toLowerCase(), []);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const locationId = params.get('l');
  const table = (params.get('t') ?? '').trim().slice(0, 40) || null;
  const [page, setPage] = useState<PublicBusinessPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [hasCard, setHasCard] = useState(false);

  useEffect(() => {
    let live = true;
    setState('loading');
    getPublicBusinessPage(slug)
      .then((p) => {
        if (!live) return;
        if (!p) { setState('missing'); return; }
        setPage(p);
        setState('ready');
        // An old address: show the current one (printed codes keep working).
        if (p.slug !== slug) window.history.replaceState({}, '', `/v/${p.slug}${window.location.search}`);
      })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [slug, retry]);

  useEffect(() => {
    if (page) document.title = `${page.businessName} | Stampfix`;
  }, [page]);

  // A signed-in guest with this shop's card sees "Open my card".
  useEffect(() => {
    if (!page || !user) { setHasCard(false); return; }
    let live = true;
    void supabase.from('cards').select('id').eq('campaign_id', page.campaignId).eq('customer_id', user.id).limit(1)
      .then(({ data }) => { if (live) setHasCard(!!data && data.length > 0); });
    return () => { live = false; };
  }, [page, user]);

  if (state === 'loading' || (state === 'ready' && authLoading)) {
    return <Centered><Loader2 className="w-6 h-6 animate-spin text-[#8A8178]" /></Centered>;
  }
  if (state === 'error') {
    return (
      <Centered>
        <p className="text-[#5B544D] max-w-xs mb-5">{t('cust.page.loadError', { defaultValue: "We couldn't load this page. Check your connection and try again." })}</p>
        <button onClick={() => setRetry((n) => n + 1)} className="rounded-xl px-5 py-3 font-semibold text-white" style={{ background: INK }}>
          {t('cust.page.tryAgain', { defaultValue: 'Try again' })}
        </button>
      </Centered>
    );
  }
  if (state === 'missing' || !page) {
    return (
      <Centered>
        <Store className="w-8 h-8 text-[#B5ADA4] mb-3" />
        <h1 className="text-xl font-serif-display font-semibold mb-1">{t('cust.page.notFound', { defaultValue: 'Page not found' })}</h1>
        <p className="text-[#5B544D] max-w-xs">{t('cust.page.notFoundHint', { defaultValue: 'This code may be out of date. Please ask the staff.' })}</p>
      </Centered>
    );
  }
  const isOwner = !!user && user.id === page.merchantId;
  if (!page.available && !isOwner) {
    return (
      <Centered>
        <h1 className="text-xl font-serif-display font-semibold mb-1">{page.businessName}</h1>
        <p className="text-[#5B544D] max-w-xs">{t('cust.page.unavailable', { defaultValue: "This page isn't available right now." })}</p>
      </Centered>
    );
  }
  if (!page.approved && !isOwner) {
    return (
      <Centered>
        <h1 className="text-xl font-serif-display font-semibold mb-1">{t('cust.app.almostReady', { defaultValue: 'Almost ready' })}</h1>
        <p className="text-[#5B544D] max-w-xs">{t('cust.app.notApproved', { name: page.businessName, defaultValue: "{{name}}'s loyalty card isn't live just yet. They're finishing setup, so please check back soon." })}</p>
      </Centered>
    );
  }
  return (
    <div className="min-h-screen" style={{ background: PAGE_BG }}>
      {isOwner && (!page.approved || !page.available) && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs text-center px-4 py-2">
          {t('cust.page.ownerOnly', { defaultValue: 'Only you can see this page until your shop is approved.' })}
        </div>
      )}
      <BusinessPageView page={page} locationId={locationId} table={table} hasCard={hasCard}
        here={`/v/${page.slug}${window.location.search}`} />
    </div>
  );
}
