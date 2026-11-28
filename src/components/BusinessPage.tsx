import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, Wallet, Stamp, UtensilsCrossed, Globe, Star, ShoppingBag, Bike, Instagram, Facebook, Music2, Linkedin,
  ChevronRight, MapPin, Store, Wifi, MessageSquareHeart, Gamepad2, ArrowRight,
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

/** Web links shown as rows, in this order (same keys as Links & socials). Each has its own colour. */
const LINK_ROWS: { key: string; icon: typeof Globe; en: string; tkey: string; tint: string }[] = [
  { key: 'googleReview', icon: Star, en: 'Leave us a review', tkey: 'cust.page.linkReview', tint: '#F59E0B' },
  { key: 'website', icon: Globe, en: 'Website', tkey: 'cust.page.linkWebsite', tint: '#4F46E5' },
  { key: 'order', icon: ShoppingBag, en: 'Order online', tkey: 'cust.page.linkOrder', tint: '#EA580C' },
  { key: 'delivery', icon: Bike, en: 'Delivery', tkey: 'cust.page.linkDelivery', tint: '#059669' },
];
/** Social networks, shown as round buttons in their brand colours. */
const SOCIALS: { key: string; icon: typeof Globe; en: string; tkey: string; bg: string }[] = [
  { key: 'instagram', icon: Instagram, en: 'Instagram', tkey: 'cust.page.linkInstagram', bg: 'linear-gradient(45deg, #F58529 0%, #DD2A7B 50%, #8134AF 100%)' },
  { key: 'facebook', icon: Facebook, en: 'Facebook', tkey: 'cust.page.linkFacebook', bg: '#1877F2' },
  { key: 'tiktok', icon: Music2, en: 'TikTok', tkey: 'cust.page.linkTiktok', bg: '#111111' },
  { key: 'linkedin', icon: Linkedin, en: 'LinkedIn', tkey: 'cust.page.linkLinkedin', bg: '#0A66C2' },
];
/** Colours of the big buttons. */
const TINT = { review: '#F59E0B', wifi: '#16A34A', feedback: '#2563EB', game: '#7C3AED', order: '#EA580C', stamp: '#0EA5E9' } as const;
const STORY_RING = 'linear-gradient(45deg, #F59E0B 0%, #EC4899 50%, #8B5CF6 100%)';

const hexOf = (c: string | null | undefined): string | null => { const m = c ? HEX.exec(c.trim()) : null; return m ? `#${m[1]}` : null; };
/** Mix a colour towards black (to = 0) or white (to = 255). */
function mix(hex: string, to: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `#${[16, 8, 0].map((sh) => Math.round(((n >> sh) & 255) * (1 - amount) + to * amount).toString(16).padStart(2, '0')).join('')}`;
}
/** The banner at the top: a soft gradient of the shop's colour. */
export function pageBanner(color: string | null | undefined): string {
  const c = hexOf(color) ?? '#6B5E55';
  const l = lum(c) ?? 0;
  const from = mix(c, 0, l > 200 ? 0.18 : 0.38);
  const to = mix(c, 255, l > 200 ? 0 : 0.32);
  return `radial-gradient(90% 120% at 100% 0%, ${mix(c, 255, 0.45)}66 0%, transparent 60%), linear-gradient(135deg, ${from} 0%, ${c} 55%, ${to} 100%)`;
}
const initialsOf = (name: string) => name.split(/[\s&]+/).filter((w) => /\p{L}|\d/u.test(w[0] ?? '')).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '•';

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
  const withHref = <T extends { key: string }>(list: T[]) => list
    .map((l) => ({ ...l, href: page.links[l.key] ? safeHref(page.links[l.key]) : null }))
    .filter((l): l is T & { href: string } => !!l.href);
  const rows = withHref(LINK_ROWS.filter((l) => l.key !== 'googleReview' || !reviewHref)); // the review link gets its own button
  const socials = withHref(SOCIALS);
  const tableLabel = table ? (isTableNumber(table) ? t('cust.page.tableN', { n: table, defaultValue: 'Table {{n}}' }) : table) : null;
  const banner = pageBanner(page.look?.accentColor ?? page.primaryColor ?? page.cardColor);

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
  const chip = (tint: string): CSSProperties => ({ background: `${tint}${theme.dark ? '2E' : '1A'}`, color: tint });
  const press = 'transition active:scale-[0.98]';
  const rowCls = `flex items-center gap-3 w-full rounded-2xl border shadow-sm px-4 py-3.5 font-semibold text-left hover:bg-[color:var(--pg-soft)] ${press}`;

  // At a table: a big button first. Otherwise: a row under the card.
  const orderButton = order && (tableLabel ? (
    <a href={order} onClick={block} data-page-order
      className={`flex items-center gap-3 w-full rounded-2xl px-5 py-4 font-semibold shadow-sm ${press}`}
      style={{ background: accent.bg, color: accent.ink }}>
      <UtensilsCrossed className="w-5 h-5 shrink-0" />
      <span className="flex-1 text-left">{t('cust.page.orderAt', { table: tableLabel, defaultValue: 'Order at {{table}}' })}</span>
      <ChevronRight className="w-5 h-5 shrink-0 opacity-80" />
    </a>
  ) : (
    <a href={order} onClick={block} data-page-order className={rowCls} style={cardStyle}>
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={chip(TINT.order)}><UtensilsCrossed className="w-5 h-5" /></span>
      <span className="flex-1 text-left leading-snug">{t('cust.page.menuOrder', { defaultValue: 'See the menu and order' })}</span>
      <ChevronRight className="w-5 h-5 shrink-0" style={{ color: theme.line }} />
    </a>
  ));

  // The big buttons: review, Wi-Fi, feedback, game. Each has its own colour.
  const tiles: { key: keyof typeof TINT; icon: typeof Globe; label: string; sub?: string; href?: string; onClick?: () => void }[] = [];
  if (reviewHref) tiles.push({ key: 'review', icon: Star, label: t('cust.page.tileReviewShort', { defaultValue: 'Google review' }), href: reviewHref });
  if (page.wifi) tiles.push({ key: 'wifi', icon: Wifi, label: t('cust.page.tileWifi', { defaultValue: 'Wi-Fi' }), sub: page.wifi.ssid, onClick: () => setSheet('wifi') });
  if (page.feedbackOn) tiles.push({ key: 'feedback', icon: MessageSquareHeart, label: t('cust.page.tileFeedback', { defaultValue: 'Give feedback' }), sub: t('cust.page.tileFeedbackSub', { defaultValue: 'Anonymous' }), onClick: () => setSheet('feedback') });
  if (page.gameOn) tiles.push({ key: 'game', icon: Gamepad2, label: t('cust.page.tileGame', { defaultValue: 'Play a game' }), sub: t('cust.page.tileGameSub', { defaultValue: 'While you wait' }), onClick: () => setSheet('game') });

  const logoNode = page.logoImage
    ? <img src={page.logoImage} alt="" className="w-full h-full object-contain p-1" />
    : page.customIcon ? <span aria-hidden="true">{page.customIcon}</span> : null;

  const stampRow = (
    <>
      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={chip(TINT.stamp)}><Stamp className="w-5 h-5" /></span>
      <span className="flex-1 leading-snug">{t('cust.page.collectStamp', { defaultValue: 'Collect a stamp' })}</span>
      <ChevronRight className="w-5 h-5 shrink-0" style={{ color: theme.line }} />
    </>
  );

  return (
    <div className="min-h-full w-full" style={{ background: theme.bg, color: theme.ink, ...vars }} data-business-page={page.slug}
      data-page-theme={page.look?.background ?? 'cream'}>
      <div className="mx-auto w-full max-w-md pb-10">
        {/* Banner in the shop's colour */}
        <div className="relative h-32 sm:h-36 sm:rounded-b-[28px] overflow-hidden" style={{ background: banner }} data-page-banner aria-hidden="true">
          <span className="absolute -left-10 -bottom-16 w-48 h-48 rounded-full bg-white/10" />
          <span className="absolute right-8 -top-10 w-28 h-28 rounded-full bg-white/10" />
        </div>

        <div className="px-5">
          <header className="relative -mt-11" data-page-header>
            <div className="flex items-end justify-between gap-3">
              <div className="w-[84px] h-[84px] rounded-[24px] overflow-hidden flex items-center justify-center text-4xl shadow-lg"
                style={{ background: page.logoImage || page.customIcon ? (theme.dark ? theme.card : '#FFFFFF') : accent.bg, color: accent.ink, boxShadow: `0 0 0 4px ${theme.bg}, 0 10px 24px -8px rgba(0,0,0,0.25)` }}
                data-page-logo>
                {page.logoImage
                  ? <img src={page.logoImage} alt="" className="w-full h-full object-contain p-2.5" />
                  : page.customIcon
                    ? <span aria-hidden="true">{page.customIcon}</span>
                    : <span className="text-2xl font-bold tracking-tight" aria-hidden="true">{initialsOf(page.businessName)}</span>}
              </div>
              {tableLabel && (
                <span className="mb-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={chip(TINT.order)} data-page-table>
                  <UtensilsCrossed className="w-3.5 h-3.5" />{tableLabel}
                </span>
              )}
            </div>
            <h1 className={`mt-3 text-[26px] leading-tight break-words ${headingClass}`} data-page-name>{page.businessName}</h1>
            {loc && page.locations.length > 1 && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm" style={{ color: theme.muted }}><MapPin className="w-3.5 h-3.5" />{loc.name}</p>
            )}
            {page.about && <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line break-words" style={{ color: theme.muted }} data-page-about>{page.about}</p>}
          </header>

          <div className="mt-5 space-y-4">
            {page.stories.length > 0 && (
              <StoryRail stories={page.stories} seen={seen} ring={STORY_RING} seenRing={theme.seen} bg={theme.bg} text={theme.muted}
                onOpen={openStory} start />
            )}

            {/* At a table with ordering on, ordering comes first. */}
            {tableLabel && orderButton}

            {/* The stamp card: one row like the others, in the shop's colour. */}
            <div className="space-y-2" data-page-card>
              <a href={join} onClick={block} data-page-join
                className={`flex items-center gap-3 w-full rounded-2xl px-4 py-3.5 shadow-sm ${press}`}
                style={{ background: accent.bg, color: accent.ink }}>
                <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: accent.ink === '#FFFFFF' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)' }}>
                  <Wallet className="w-5 h-5" />
                </span>
                <span className="flex-1 min-w-0 text-left">
                  <span className="block font-semibold leading-snug" data-page-join-label>{hasCard ? t('cust.page.openCard', { defaultValue: 'Open my card' }) : t('cust.page.getCard', { defaultValue: 'Get your stamp card' })}</span>
                  <span className="block text-[13px] leading-snug opacity-80 break-words" data-page-reward>
                    {page.offerTitle && page.maxStamps
                      ? t('cust.page.reward', { count: page.maxStamps, reward: page.offerTitle, defaultValue: 'Collect {{count}} stamps, get {{reward}}' })
                      : t('cust.page.rewardPlain', { defaultValue: 'Collect stamps and get a reward' })}
                  </span>
                </span>
                <ArrowRight className="w-5 h-5 shrink-0 opacity-80" />
              </a>
              {!hasCard && (
                <p className="text-xs text-center" style={{ color: theme.faint }}>{t('cust.page.noApp', { defaultValue: 'No app needed. It goes in Apple or Google Wallet.' })}</p>
              )}
            </div>

            {page.selfServe && page.locations.length > 0 && (
              loc ? (
                <a href={stamp(loc.id)} onClick={block} data-page-stamp className={rowCls} style={cardStyle}>{stampRow}</a>
              ) : !pickBranch ? (
                <button type="button" onClick={() => setPickBranch(true)} data-page-stamp className={rowCls} style={cardStyle}>{stampRow}</button>
              ) : (
                <div className="rounded-2xl border shadow-sm p-3 space-y-2" style={cardStyle} data-page-branches>
                  <p className="text-sm font-semibold px-1 pt-1">{t('cust.page.whichBranch', { defaultValue: 'Which branch are you at?' })}</p>
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

            {!tableLabel && orderButton}

            {tiles.length > 0 && (
              <div className="grid grid-cols-2 gap-3" data-page-tiles>
                {tiles.map(({ key, icon: Icon, label, sub, href, onClick }, i) => {
                  const wide = tiles.length % 2 === 1 && i === tiles.length - 1;
                  const inner = (
                    <>
                      <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={chip(TINT[key])}>
                        <Icon className="w-5 h-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug break-words">{label}</span>
                        {sub && <span className="block text-xs truncate mt-0.5" style={{ color: theme.faint }}>{sub}</span>}
                      </span>
                    </>
                  );
                  const cls = `flex ${wide ? 'col-span-2' : ''} flex-row items-center gap-3 text-left rounded-2xl border shadow-sm p-3.5 min-h-[76px] hover:bg-[color:var(--pg-soft)] ${press}`;
                  return href ? (
                    <a key={key} href={href} target="_blank" rel="noopener noreferrer" onClick={block} data-page-tile={key} className={cls} style={cardStyle}>{inner}</a>
                  ) : (
                    <button key={key} type="button" onClick={onClick} data-page-tile={key} className={cls} style={cardStyle}>{inner}</button>
                  );
                })}
              </div>
            )}

            {rows.length > 0 && (
              <nav className="rounded-2xl border shadow-sm overflow-hidden" style={cardStyle} data-page-links>
                {rows.map(({ key, icon: Icon, en, tkey, href, tint }, i) => (
                  <a key={key} href={href} target="_blank" rel="noopener noreferrer" onClick={block} data-page-link={key}
                    className={`flex items-center gap-3 px-4 py-3 text-[15px] font-medium hover:bg-[color:var(--pg-soft)] ${i > 0 ? 'border-t' : ''}`}
                    style={{ borderColor: theme.border }}>
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={chip(tint)}><Icon className="w-[18px] h-[18px]" /></span>
                    <span className="flex-1 min-w-0 truncate">{t(tkey, { defaultValue: en })}</span>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: theme.line }} />
                  </a>
                ))}
              </nav>
            )}

            {socials.length > 0 && (
              <div className="flex items-center justify-center gap-3 pt-1" data-page-socials>
                {socials.map(({ key, icon: Icon, en, tkey, href, bg }) => (
                  <a key={key} href={href} target="_blank" rel="noopener noreferrer" onClick={block} data-page-link={key}
                    aria-label={t(tkey, { defaultValue: en })} title={t(tkey, { defaultValue: en })}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm hover:opacity-90 ${press}`}
                    style={{ background: bg }}>
                    <Icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
            )}

            <footer className="pt-3 flex items-center justify-between gap-3 text-xs" style={{ color: theme.faint }}>
              <a href="https://stampfix.app" onClick={block} className="hover:underline">{t('cust.page.poweredBy', { defaultValue: 'Powered by Stampfix' })}</a>
              <div className="flex items-center gap-3">
                <a href="/cardholder-privacy" onClick={block} className="hover:underline">{t('cust.page.privacy', { defaultValue: 'Privacy' })}</a>
                {!preview && <LanguageSwitcher className={theme.dark ? 'bg-white rounded-lg' : ''} />}
              </div>
            </footer>
          </div>
        </div>
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

/** The page is off: go on to where the code led before the Business page. */
function PageOffRedirect({ page, locationId, table }: { page: PublicBusinessPage; locationId: string | null; table: string | null }) {
  const { join, order } = pageTargets(page, { locationId, table });
  const target = table && order ? order : join;
  useEffect(() => { window.location.replace(target); }, [target]);
  return <Centered><Loader2 className="w-6 h-6 animate-spin text-[#8A8178]" /></Centered>;
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
  if (!page.enabled && !isOwner) {
    // The shop hasn't turned its page on: straight on to sign-up, or to
    // ordering from a table code, as before the Business page existed.
    return <PageOffRedirect page={page} locationId={locationId} table={table} />;
  }
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
      {isOwner && (!page.approved || !page.available) ? (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs text-center px-4 py-2">
          {t('cust.page.ownerOnly', { defaultValue: 'Only you can see this page until your shop is approved.' })}
        </div>
      ) : isOwner && !page.enabled ? (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs text-center px-4 py-2" data-page-off-banner>
          {t('cust.page.ownerOff', { defaultValue: 'Your page is off, so only you see it. Guests who scan go straight to sign-up. Turn it on in your dashboard.' })}
        </div>
      ) : null}
      <BusinessPageView page={page} locationId={locationId} table={table} hasCard={hasCard}
        here={`/v/${page.slug}${window.location.search}`} />
    </div>
  );
}
