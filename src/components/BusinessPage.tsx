import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, Wallet, Stamp, UtensilsCrossed, Globe, Star, ShoppingBag, Bike, Instagram, Facebook, Music2, Linkedin,
  ChevronRight, MapPin, Store, Wifi, MessageSquareHeart, Gamepad2,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getPublicBusinessPage, type PageBackground, type PublicBusinessPage } from '../lib/businessPage';
import { orderUrl, isTableNumber } from '../lib/ordering';
import { LanguageSwitcher } from './LanguageSwitcher';
import { StoryRail, StoryViewer, readSeen, writeSeen } from './PageStories';
import { FeedbackSheet, WifiSheet } from './PageExtras';

// The game loads only when a guest opens it.
const PageGame = lazy(() => import('./PageGame'));

// The shop's Business page: stampfix.app/v/<address>[?l=<branch>][&t=<table>].
// One QR code on tables, the door and the counter opens it. From here the
// guest joins the stamp card (or opens theirs), collects a stamp with the
// counter code (self-serve shops), orders (when ordering is on) and finds the
// shop's links. Every button leads into the existing join, stamp and order
// pages, which work exactly as they do from their own QR codes.

const PAGE_BG = '#FAF7F2';
const INK = '#2F2A26';
const HEX = /^#?([0-9a-fA-F]{6})$/;

/** The page's colours for each background a Pro shop can pick (cream is the standard look). */
export interface PageTheme {
  bg: string; card: string; border: string; ink: string; muted: string; faint: string; line: string; soft: string; seen: string; dark: boolean;
}
const THEMES: Record<PageBackground, PageTheme> = {
  cream: { bg: PAGE_BG, card: '#FFFFFF', border: 'rgba(0,0,0,0.05)', ink: INK, muted: '#5B544D', faint: '#8A8178', line: '#B5ADA4', soft: '#FCFBF9', seen: '#D9D3CB', dark: false },
  white: { bg: '#FFFFFF', card: '#FFFFFF', border: 'rgba(0,0,0,0.09)', ink: INK, muted: '#5B544D', faint: '#8A8178', line: '#B5ADA4', soft: '#F8F7F5', seen: '#DDD8D2', dark: false },
  stone: { bg: '#ECE8E2', card: '#FFFFFF', border: 'rgba(0,0,0,0.06)', ink: INK, muted: '#57504A', faint: '#7D746B', line: '#A8A097', soft: '#F7F5F2', seen: '#CBC4BB', dark: false },
  dark: { bg: '#191817', card: '#252321', border: 'rgba(255,255,255,0.08)', ink: '#F4F1EC', muted: '#D2CBC2', faint: '#A39B92', line: '#6F6861', soft: '#2E2B28', seen: '#4A4642', dark: true },
};
export function pageTheme(bg: PageBackground | null | undefined): PageTheme {
  return THEMES[bg ?? 'cream'] ?? THEMES.cream;
}

function lum(color: string | null | undefined): number | null {
  const m = color ? HEX.exec(color.trim()) : null;
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}
/**
 * The shop's colour for buttons. On a light page: our warm ink when it's
 * missing or too pale to see. On the dark page: a light button when it's
 * missing or too dark to see.
 */
export function pageAccent(color: string | null | undefined, dark = false): { bg: string; ink: string } {
  const l = lum(color);
  if (dark) {
    if (l === null || l < 60) return { bg: '#F4F1EC', ink: '#191817' };
  } else if (l === null || l > 200) {
    return { bg: INK, ink: '#FFFFFF' };
  }
  const hex = color!.trim().startsWith('#') ? color!.trim() : `#${color!.trim()}`;
  return { bg: hex, ink: l! > 150 ? '#1A1A1A' : '#FFFFFF' };
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
  const theme = pageTheme(page.look?.background);
  const accent = pageAccent(page.look?.accentColor ?? page.primaryColor, theme.dark);
  const serif = page.look?.headingStyle !== 'sans';
  const headingClass = serif ? 'font-serif-display font-semibold' : 'font-bold tracking-tight';
  const { loc, join, stamp, order } = pageTargets(page, { locationId, table, here });
  const [pickBranch, setPickBranch] = useState(false);
  const [sheet, setSheet] = useState<null | 'wifi' | 'feedback' | 'game'>(null);
  const block = (e: React.MouseEvent) => { if (preview) e.preventDefault(); };
  const reviewHref = page.links.googleReview ? safeHref(page.links.googleReview) : null;
  const links = LINK_ORDER
    .filter((l) => l.key !== 'googleReview' || !reviewHref) // the review link gets its own button
    .map((l) => ({ ...l, href: page.links[l.key] ? safeHref(page.links[l.key]) : null }))
    .filter((l): l is typeof l & { href: string } => !!l.href);
  const tableLabel = table ? (isTableNumber(table) ? t('cust.page.tableN', { n: table, defaultValue: 'Table {{n}}' }) : table) : null;
  const max = page.maxStamps && page.maxStamps > 0 ? Math.min(page.maxStamps, 12) : null;

  // Stories: which ones this phone has seen (the dashboard preview never saves).
  const [seen, setSeen] = useState<Set<string>>(() => (preview ? new Set() : readSeen(page.campaignId)));
  const [viewer, setViewer] = useState<number | null>(null);
  const pushed = useRef(false);
  const markSeen = (id: string) => setSeen((prev) => {
    if (prev.has(id)) return prev;
    const next = new Set(prev).add(id);
    if (!preview) writeSeen(page.campaignId, next);
    return next;
  });
  // The phone's Back button closes the stories, not the page.
  useEffect(() => {
    if (preview) return;
    const onPop = () => { pushed.current = false; setViewer(null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [preview]);
  const openStory = (i: number) => {
    if (!preview && !pushed.current) {
      try { window.history.pushState({ ...(window.history.state ?? {}), sfStory: 1 }, ''); pushed.current = true; } catch { /* fine without */ }
    }
    setViewer(i);
  };
  const closeStory = () => {
    setViewer(null);
    if (pushed.current) {
      pushed.current = false;
      try { window.history.back(); } catch { /* fine */ }
    }
  };
  const vars = { '--pg-soft': theme.soft } as CSSProperties;
  const cardStyle: CSSProperties = { background: theme.card, borderColor: theme.border };

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

  // The big buttons under the card: review, Wi-Fi, feedback, game.
  const tiles: { key: string; icon: typeof Globe; label: string; sub?: string; href?: string; onClick?: () => void }[] = [];
  if (reviewHref) tiles.push({ key: 'review', icon: Star, label: t('cust.page.tileReview', { defaultValue: 'Leave a Google review' }), href: reviewHref });
  if (page.wifi) tiles.push({ key: 'wifi', icon: Wifi, label: t('cust.page.tileWifi', { defaultValue: 'Wi-Fi' }), sub: page.wifi.ssid, onClick: () => setSheet('wifi') });
  if (page.feedbackOn) tiles.push({ key: 'feedback', icon: MessageSquareHeart, label: t('cust.page.tileFeedback', { defaultValue: 'Give feedback' }), sub: t('cust.page.tileFeedbackSub', { defaultValue: 'Anonymous' }), onClick: () => setSheet('feedback') });
  if (page.gameOn) tiles.push({ key: 'game', icon: Gamepad2, label: t('cust.page.tileGame', { defaultValue: 'Play a game' }), sub: t('cust.page.tileGameSub', { defaultValue: 'While you wait' }), onClick: () => setSheet('game') });

  const logoNode = page.logoImage
    ? <img src={page.logoImage} alt="" className="w-full h-full object-contain p-1" />
    : page.customIcon ? <span aria-hidden="true">{page.customIcon}</span> : null;

  return (
    <div className="min-h-full w-full" style={{ background: theme.bg, color: theme.ink, ...vars }} data-business-page={page.slug}
      data-page-theme={page.look?.background ?? 'cream'}>
      <div className="mx-auto w-full max-w-md px-5 pt-6 pb-10 space-y-5">
        {page.stories.length > 0 && (
          <StoryRail stories={page.stories} seen={seen} ring={accent.bg} seenRing={theme.seen} bg={theme.bg} text={theme.muted}
            onOpen={openStory} />
        )}
        <header className={`text-center space-y-3 ${page.stories.length > 0 ? '' : 'pt-2'}`}>
          <div className="mx-auto w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-3xl shadow-sm border"
            style={{ background: page.logoImage ? '#FFFFFF' : accent.bg, color: accent.ink, borderColor: theme.border }}>
            {page.logoImage
              ? <img src={page.logoImage} alt="" className="w-full h-full object-contain p-2" />
              : page.customIcon
                ? <span aria-hidden="true">{page.customIcon}</span>
                : <Store className="w-8 h-8" aria-hidden="true" />}
          </div>
          <div>
            <h1 className={`text-2xl leading-tight break-words ${headingClass}`} data-page-name>{page.businessName}</h1>
            {loc && page.locations.length > 1 && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium" style={{ color: theme.muted }}><MapPin className="w-3.5 h-3.5" />{loc.name}</p>
            )}
          </div>
          {page.about && <p className="text-[15px] leading-relaxed whitespace-pre-line break-words" style={{ color: theme.muted }} data-page-about>{page.about}</p>}
        </header>

        {/* At a table with ordering on, ordering comes first. */}
        {tableLabel && orderButton}

        <section className="rounded-2xl border shadow-sm p-5 space-y-4" style={cardStyle} data-page-card>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent.bg, color: accent.ink }}>
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.faint }}>{t('cust.page.stampCard', { defaultValue: 'Stamp card' })}</div>
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
            <p className="text-xs text-center" style={{ color: theme.faint }}>{t('cust.page.noApp', { defaultValue: 'No app needed. It goes in Apple or Google Wallet.' })}</p>
          )}
          {page.selfServe && page.locations.length > 0 && (
            loc ? (
              <a href={stamp(loc.id)} onClick={block} data-page-stamp
                className="flex items-center justify-center gap-2 w-full rounded-xl py-3 font-medium border-2"
                style={{ borderColor: accent.bg, color: theme.ink }}>
                <Stamp className="w-4 h-4" />{t('cust.page.collectStamp', { defaultValue: 'Collect a stamp' })}
              </a>
            ) : !pickBranch ? (
              <button type="button" onClick={() => setPickBranch(true)} data-page-stamp
                className="flex items-center justify-center gap-2 w-full rounded-xl py-3 font-medium border-2"
                style={{ borderColor: accent.bg, color: theme.ink }}>
                <Stamp className="w-4 h-4" />{t('cust.page.collectStamp', { defaultValue: 'Collect a stamp' })}
              </button>
            ) : (
              <div className="space-y-2" data-page-branches>
                <p className="text-sm font-medium text-center">{t('cust.page.whichBranch', { defaultValue: 'Which branch are you at?' })}</p>
                {page.locations.map((l) => (
                  <a key={l.id} href={stamp(l.id)} onClick={block}
                    className="flex items-center gap-2 w-full rounded-xl px-4 py-3 border text-sm font-medium"
                    style={{ background: theme.soft, borderColor: theme.border }}>
                    <MapPin className="w-4 h-4" style={{ color: theme.faint }} /><span className="flex-1 text-left">{l.name}</span><ChevronRight className="w-4 h-4" style={{ color: theme.faint }} />
                  </a>
                ))}
              </div>
            )
          )}
        </section>

        {!tableLabel && orderButton}

        {tiles.length > 0 && (
          <div className="grid grid-cols-2 gap-3" data-page-tiles>
            {tiles.map(({ key, icon: Icon, label, sub, href, onClick }, i) => {
              const wide = tiles.length % 2 === 1 && i === tiles.length - 1;
              const inner = (
                <>
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent.bg, color: accent.ink }}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug break-words">{label}</span>
                    {sub && <span className="block text-xs truncate mt-0.5" style={{ color: theme.faint }}>{sub}</span>}
                  </span>
                </>
              );
              const cls = `flex ${wide ? 'col-span-2 flex-row items-center' : 'flex-col items-start'} gap-3 text-left rounded-2xl border shadow-sm p-4 hover:bg-[color:var(--pg-soft)] transition`;
              return href ? (
                <a key={key} href={href} target="_blank" rel="noopener noreferrer" onClick={block} data-page-tile={key} className={cls} style={cardStyle}>{inner}</a>
              ) : (
                <button key={key} type="button" onClick={onClick} data-page-tile={key} className={cls} style={cardStyle}>{inner}</button>
              );
            })}
          </div>
        )}

        {links.length > 0 && (
          <nav className="rounded-2xl border shadow-sm overflow-hidden" style={cardStyle} data-page-links>
            {links.map(({ key, icon: Icon, en, tkey, href }, i) => (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" onClick={block} data-page-link={key}
                className={`flex items-center gap-3 px-5 py-3.5 text-[15px] font-medium hover:bg-[color:var(--pg-soft)] ${i > 0 ? 'border-t' : ''}`}
                style={{ borderColor: theme.border }}>
                <Icon className="w-5 h-5 shrink-0" style={{ color: theme.faint }} />
                <span className="flex-1 min-w-0 truncate">{t(tkey, { defaultValue: en })}</span>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: theme.line }} />
              </a>
            ))}
          </nav>
        )}

        <footer className="pt-2 flex items-center justify-between gap-3 text-xs" style={{ color: theme.faint }}>
          <a href="https://stampfix.app" onClick={block} className="hover:underline">{t('cust.page.poweredBy', { defaultValue: 'Powered by Stampfix' })}</a>
          <div className="flex items-center gap-3">
            <a href="/cardholder-privacy" onClick={block} className="hover:underline">{t('cust.page.privacy', { defaultValue: 'Privacy' })}</a>
            {!preview && <LanguageSwitcher className={theme.dark ? 'bg-white rounded-lg' : ''} />}
          </div>
        </footer>
      </div>

      {viewer !== null && page.stories.length > 0 && (
        <StoryViewer stories={page.stories} start={viewer} title={page.businessName} logo={logoNode}
          onClose={closeStory} onSeen={markSeen} />
      )}
      {sheet === 'wifi' && page.wifi && <WifiSheet wifi={page.wifi} accent={accent} onClose={() => setSheet(null)} />}
      {sheet === 'feedback' && (
        <FeedbackSheet campaignId={page.campaignId} businessName={page.businessName} accent={accent} preview={preview}
          locationId={loc?.id ?? null} table={table ?? null} onClose={() => setSheet(null)} />
      )}
      {sheet === 'game' && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>}>
          <PageGame accent={accent} title={page.businessName} onClose={() => setSheet(null)} />
        </Suspense>
      )}
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
    <div className="min-h-screen" style={{ background: pageTheme(page.look?.background).bg }}>
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
