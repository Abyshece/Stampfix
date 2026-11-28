import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-qr-code';
import {
  Check, Copy, ExternalLink, Loader2, RefreshCw, Download, ChevronRight, ChevronLeft, MapPin, Lock, UtensilsCrossed, Stamp,
  Eye, X, Store, MessageSquareHeart, Settings2, Link2, ImagePlus, Trash2,
} from 'lucide-react';
import type { Campaign, Location } from '../types';
import type { OnboardingState } from '../lib/db';
import type { PosterSize } from '../services/posterGenerator';
import {
  businessPageUrl, saveBusinessPage, setCounterCode, setBusinessPageEnabled, savePageLook, savePageExtras, getMyPageStories, validSlug, pageIsOn,
  setPagePhoto, pagePhotoUrl, ABOUT_MAX, DEFAULT_LOOK,
  type MyBusinessPage, type PublicBusinessPage, type SavePageError, type MyPageStory, type PageLook, type PageExtras, type PagePhotoKind,
} from '../lib/businessPage';
import { preparePagePhoto, PagePhotoPrepFailed } from '../lib/pagePhoto';
import { downloadCounterCodePng } from '../services/posterImage';
import { BusinessPageView, pageTheme, pageBanner } from './BusinessPage';
import { ButtonsFields, LookFields, sameExtras, sameLook, LOOK_ERRORS, EXTRA_ERRORS } from './BusinessPageLook';
import { StoriesTab } from './BusinessPageStories';
import { FeedbackTab } from './BusinessPageFeedback';
import { LinksSettings, normalizeLink } from './LinksSettings';
import { PosterSettings } from './PosterSettings';
import { ProLockOverlay } from './ProLockOverlay';

// Business page in the dashboard. One card at the top says whether the page
// is on (guests who scan see it) or off (guests go straight to sign-up, as
// before), with the switch. Below, the page is set up in clear steps, one at
// a time, with a live preview beside it (a Preview button on phones):
//   1 Basics  2 Look  3 Stories  4 Buttons  5 Links  6 QR code
// Feedback from guests has its own view.

export type PageSection = 'profile' | 'look' | 'stories' | 'buttons' | 'links' | 'qr' | 'feedback';

interface Props {
  campaign: Campaign;
  locations: Location[];
  /** The shop's page (null while loading, or when it couldn't be loaded). */
  page: MyBusinessPage | null;
  pageError: boolean;
  onRetryPage: () => void;
  onPageSaved: (p: MyBusinessPage) => void;
  section: PageSection;
  onSection: (s: PageSection) => void;
  isPro: boolean;
  /** False for staff who may not open Settings: they can print, not change. */
  canEdit: boolean;
  orderingEnabled: boolean;
  onUpgrade: () => void;
  onUpdateCampaign: (patch: Partial<Campaign>) => unknown;
  onboarding: OnboardingState;
  onMarkOnboardingStep: (patch: Partial<OnboardingState>) => Promise<void> | void;
  onDownloadPoster: (location: Location | null, size: PosterSize, lang: 'en' | 'de') => void;
  joinUrlForLocation: (locationId: string | null) => string;
  stampUrlForLocation: (locationId: string | null) => string;
  onOpenSettings: (section: 'general' | 'wallet' | 'stamping') => void;
  onOpenAddons: () => void;
  /** Feedback guests sent that the owner hasn't seen (for the badge). */
  unreadFeedback: number;
  onFeedbackRead: () => void;
}

const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-opacity-90 transition disabled:opacity-50';
const btnLight = 'inline-flex items-center justify-center gap-1.5 bg-white border notion-border text-[#37352F] px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-[#F7F7F5] transition disabled:opacity-50';
const DEFAULT_EXTRAS: PageExtras = { wifiSsid: null, wifiPassword: null, feedbackOn: true, gameOn: true };

function CopyButton({ text, label, testId, small }: { text: string; label: string; testId?: string; small?: boolean }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  const cls = `${btnLight} ${small ? '!px-2.5 !py-1.5 text-xs' : ''}`;
  return (
    <button type="button" data-copy={testId} className={done ? `${cls} !bg-green-50 !border-green-200 !text-green-700` : cls}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
        setDone(true); setTimeout(() => setDone(false), 2000);
      }}>
      {done ? <><Check className="w-4 h-4" />{t('dash.page.copied', { defaultValue: 'Copied' })}</> : <><Copy className="w-4 h-4" />{label}</>}
    </button>
  );
}

function ReadOnlyNote() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border notion-border bg-[#F7F7F5] p-4 text-sm text-gray-600 flex items-center gap-2" data-read-only>
      <Lock className="w-4 h-4 shrink-0" />{t('dash.page.readOnly', { defaultValue: 'Only the owner can change this. You can still print the QR code.' })}
    </div>
  );
}

const SAVE_ERRORS: Record<SavePageError, [string, string]> = {
  bad_slug: ['dash.page.errBadSlug', 'Use 3 to 40 lowercase letters, numbers or dashes (no dash at the start or end).'],
  slug_taken: ['dash.page.errTaken', 'That address is taken. Try another one.'],
  about_too_long: ['dash.page.errAbout', 'Keep the description to 300 characters.'],
  too_many_changes: ['dash.page.errTooMany', "You've changed the address many times. Pick one you used before, or contact us."],
  no_page: ['dash.page.errNoPage', "Your page isn't ready yet. Reload and try again."],
  network: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
};

/** The on/off switch for the whole page. */
function PageSwitch({ on, busy, disabled, onToggle }: { on: boolean; busy: boolean; disabled: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled || busy} onClick={onToggle} data-page-switch={on ? 'on' : 'off'}
      aria-label={t('dash.page.switchAria', { defaultValue: 'Show my Business page to guests' })}
      className={`inline-flex items-center gap-3 rounded-full pl-4 pr-1.5 py-1.5 border text-sm font-semibold transition shrink-0 disabled:opacity-60 ${
        on ? 'bg-green-50 border-green-200 text-green-800' : 'bg-[#F7F7F5] notion-border text-gray-600 hover:bg-[#EFEFEE]'}`}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
      {on ? t('dash.page.on', { defaultValue: 'On' }) : t('dash.page.off', { defaultValue: 'Off' })}
      <span className={`relative w-12 h-7 rounded-full transition ${on ? 'bg-green-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

/** A step: where it is, what it is for, its fields, and Back / Continue. */
function StepShell({ n, total, title, desc, pro, children, footer, testId }: {
  n: number; total: number; title: string; desc: string; pro?: boolean; children: ReactNode; footer?: ReactNode; testId: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="bg-white rounded-2xl border notion-border overflow-hidden" data-step-card={testId}>
      <header className="px-5 sm:px-7 pt-5 sm:pt-6 pb-5">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <span>{t('dash.page.stepOf', { n, total, defaultValue: 'Step {{n}} of {{total}}' })}</span>
          {pro && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">Pro</span>}
        </div>
        <h2 className="mt-1.5 text-xl font-semibold leading-snug">{title}</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-xl">{desc}</p>
      </header>
      <div className="px-5 sm:px-7 pb-6">{children}</div>
      {footer && <footer className="px-5 sm:px-7 py-4 border-t notion-border bg-[#FBFBFA]">{footer}</footer>}
    </section>
  );
}

function StepFooter({ onBack, primary, onPrimary, busy, disabled, note, error }: {
  onBack?: () => void; primary?: string; onPrimary?: () => void; busy?: boolean; disabled?: boolean; note?: string | null; error?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="w-full space-y-2">
      {(error || note) && (
        <p className={`text-xs sm:text-right ${error ? 'text-red-600' : 'text-gray-500'}`} data-step-note={error ? 'error' : 'note'}>{error ?? note}</p>
      )}
      <div className="flex items-center gap-3">
        {onBack ? (
          <button type="button" onClick={onBack} data-step-back className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#37352F] px-1 py-2">
            <ChevronLeft className="w-4 h-4" />{t('dash.page.back', { defaultValue: 'Back' })}
          </button>
        ) : null}
        <span className="flex-1" />
        {primary && onPrimary && (
          <button type="button" className={btnDark} disabled={busy || disabled} onClick={onPrimary} data-step-next>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}{primary}<ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Width of a real phone screen. The preview draws the page at this width and shrinks it to fit. */
const PHONE_W = 390;

/**
 * The preview's screen: the page at a real phone's width, scaled down to the
 * frame, so it looks exactly like it does on a guest's phone. Pop-ups from the
 * page (Wi-Fi, feedback, stories) stay inside the screen.
 */
function PhoneScreen({ bg, children }: { bg: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 280, h: 608 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => { if (el.clientWidth > 0 && el.clientHeight > 0) setBox({ w: el.clientWidth, h: el.clientHeight }); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = box.w / PHONE_W;
  return (
    <div ref={ref} className="relative w-full h-full rounded-[30px] overflow-hidden" style={{ background: bg }}>
      <div className="absolute left-0 top-0" style={{ width: PHONE_W, height: box.h / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }} data-page-preview-screen>
        <div className="w-full h-full overflow-y-auto overflow-x-hidden" style={{ background: bg }}>{children}</div>
      </div>
    </div>
  );
}

export function BusinessPagePanel(props: Props) {
  const {
    campaign, locations, page, pageError, onRetryPage, onPageSaved, section, onSection, isPro, canEdit, orderingEnabled,
    onUpgrade, onUpdateCampaign, onboarding, onMarkOnboardingStep, onOpenSettings,
  } = props;
  const { t } = useTranslation();
  const active = useMemo(() => locations.filter((l) => !l.archived), [locations]);
  const topRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLElement>(null);
  const pageUrl = page ? businessPageUrl(page.slug) : null;
  const on = pageIsOn(page);
  const hasSwitch = page?.enabled !== undefined;
  const hasStories = !!page?.look;
  const hasExtras = !!page?.extras;

  // The on/off switch.
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState(false);
  const toggle = async (next = !on) => {
    if (!page) return;
    setSwitching(true); setSwitchError(false);
    const r = await setBusinessPageEnabled(campaign.id, next);
    setSwitching(false);
    if (r === null) { setSwitchError(true); return; }
    onPageSaved({ ...page, enabled: r });
  };

  // Stories (for the Stories step, the preview and the step's tick).
  const [stories, setStories] = useState<MyPageStory[] | null>(null);
  const [storiesError, setStoriesError] = useState(false);
  const [storiesTick, setStoriesTick] = useState(0);
  useEffect(() => {
    if (!hasStories) return;
    let live = true;
    setStoriesError(false);
    getMyPageStories(campaign.id)
      .then((list) => { if (live) setStories(list); })
      .catch(() => { if (live) setStoriesError(true); });
    return () => { live = false; };
  }, [campaign.id, hasStories, storiesTick]);

  // Drafts of every step live here, so the preview follows whatever you change.
  const [slugDraft, setSlugDraft] = useState(page?.slug ?? '');
  useEffect(() => { setSlugDraft(page?.slug ?? ''); }, [page?.slug]);
  const [aboutDraft, setAboutDraft] = useState(page?.about ?? '');
  useEffect(() => { setAboutDraft(page?.about ?? ''); }, [page?.about]);
  const [lookDraft, setLookDraft] = useState<PageLook>(page?.look ?? DEFAULT_LOOK);
  const lookKey = page?.look ? `${page.look.accentColor}|${page.look.background}|${page.look.headingStyle}` : '';
  useEffect(() => { if (page?.look) setLookDraft(page.look); }, [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [extrasDraft, setExtrasDraft] = useState<PageExtras>(page?.extras ?? DEFAULT_EXTRAS);
  const extrasKey = page?.extras ? JSON.stringify(page.extras) : '';
  useEffect(() => { if (page?.extras) setExtrasDraft(page.extras); }, [extrasKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const reviewSaved = (campaign.socialLinks?.googleReview ?? '').trim();
  const [reviewDraft, setReviewDraft] = useState(reviewSaved);
  useEffect(() => { setReviewDraft(reviewSaved); }, [reviewSaved]);
  const [linksDirty, setLinksDirty] = useState(false);
  const linksSave = useRef<(() => Promise<boolean>) | null>(null);

  const otherLinks = Object.entries(campaign.socialLinks ?? {}).some(([k, v]) => k !== 'googleReview' && typeof v === 'string' && v.trim() !== '');
  const steps: { id: PageSection; label: string; title: string; desc: string; pro?: boolean; done: boolean }[] = [
    { id: 'profile', label: t('dash.page.sBasics', { defaultValue: 'Basics' }), done: !!page?.about,
      title: t('dash.page.tBasics', { defaultValue: 'Your page address and a hello' }),
      desc: t('dash.page.dBasics', { defaultValue: 'Choose the address in your QR code and say a few words about your shop.' }) },
    ...(hasStories ? [
      { id: 'look' as const, label: t('dash.page.sLook', { defaultValue: 'Look' }), pro: true, done: !!page?.look && !sameLook(page.look, DEFAULT_LOOK),
        title: t('dash.page.tLook', { defaultValue: 'Make it look like you' }),
        desc: t('dash.page.dLook', { defaultValue: 'Your button colour, background and headings. Your logo and name come from your stamp card.' }) },
      { id: 'stories' as const, label: t('dash.page.sStories', { defaultValue: 'Stories' }), pro: true, done: (stories?.length ?? 0) > 0,
        title: t('dash.page.tStories', { defaultValue: 'Add stories' }),
        desc: t('dash.page.dStories', { defaultValue: 'Short videos or photos in round bubbles at the top of your page, like Instagram. They stay until you delete them.' }) },
    ] : []),
    ...(hasExtras ? [
      { id: 'buttons' as const, label: t('dash.page.sButtons', { defaultValue: 'Buttons' }), done: !!reviewSaved || !!page?.extras?.wifiSsid,
        title: t('dash.page.tButtons', { defaultValue: 'Choose your buttons' }),
        desc: t('dash.page.dButtons', { defaultValue: 'Big buttons under your stamp card. Switch on the ones you want.' }) },
    ] : []),
    { id: 'links', label: t('dash.page.sLinks', { defaultValue: 'Links' }), pro: true, done: otherLinks,
      title: t('dash.page.tLinks', { defaultValue: 'Add your links' }),
      desc: t('dash.page.dLinks', { defaultValue: 'Your website, Instagram, delivery and more. They also show on the back of your wallet card.' }) },
    { id: 'qr', label: t('dash.page.sQr', { defaultValue: 'QR code' }), done: !!onboarding.page_qr_downloaded,
      title: t('dash.page.tQr', { defaultValue: 'Print your QR code' }),
      desc: t('dash.page.dQr', { defaultValue: 'One code for your tables, door and counter. Guests scan it to reach you.' }) },
  ];
  const mode: 'setup' | 'feedback' = section === 'feedback' ? 'feedback' : 'setup';
  const idx = Math.max(0, steps.findIndex((s) => s.id === section));
  const step = steps[idx];
  const doneCount = steps.filter((s) => s.done).length;
  // Keep the current step's pill in view when the row scrolls (phones).
  useEffect(() => {
    const nav = pillsRef.current;
    const pill = nav?.querySelector<HTMLElement>(`[data-step-pill="${step?.id}"]`);
    if (!nav || !pill || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: Math.max(0, pill.offsetLeft - (nav.clientWidth - pill.offsetWidth) / 2), behavior: 'smooth' });
  }, [step?.id, mode]);
  const go = (i: number) => {
    const s = steps[Math.max(0, Math.min(steps.length - 1, i))];
    onSection(s.id);
    // Bring the step into view on phones (it starts below the top card).
    requestAnimationFrame(() => {
      const el = topRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openPage = () => {
    if (!pageUrl) return;
    window.open(pageUrl, '_blank', 'noopener');
    if (!onboarding.page_previewed) void onMarkOnboardingStep({ page_previewed: true });
  };

  // The preview shows the drafts, as guests would see them.
  const preview: PublicBusinessPage | null = page ? {
    campaignId: campaign.id, merchantId: campaign.merchantId, slug: page.slug, businessName: campaign.businessName,
    offerTitle: campaign.offerTitle || null, maxStamps: campaign.maxStamps || null, logoImage: campaign.logoImage ?? null,
    logoMode: campaign.logoMode ?? null, customIcon: campaign.customIcon || null, primaryColor: campaign.primaryColor || null,
    cardColor: null, cardTextColor: campaign.cardTextColor ?? null, about: aboutDraft.trim() || null,
    links: Object.fromEntries(Object.entries({ ...(campaign.socialLinks ?? {}), googleReview: isPro ? reviewDraft.trim() : reviewSaved })
      .filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as Record<string, string>,
    approved: true, available: true, selfServe: campaign.stampingMode === 'self_serve' && !!page.counterCode,
    orderingOpen: orderingEnabled, locations: active.map((l) => ({ id: l.id, name: l.name })),
    look: isPro && page.look ? lookDraft : null,
    stories: isPro ? (stories ?? []).filter((s) => !s.hidden) : [],
    wifi: extrasDraft.wifiSsid?.trim() ? { ssid: extrasDraft.wifiSsid.trim(), password: extrasDraft.wifiPassword || null } : null,
    feedbackOn: hasExtras && extrasDraft.feedbackOn,
    gameOn: hasExtras && extrasDraft.gameOn,
    enabled: true,
    coverImage: page.coverPath ? pagePhotoUrl(page.coverPath) : null,
    avatarImage: page.avatarPath ? pagePhotoUrl(page.avatarPath) : null,
  } : null;
  const [showPreview, setShowPreview] = useState(false);

  // ---- Saving each step ----
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  useEffect(() => { setStepError(null); }, [section]);
  const next = () => go(idx + 1);
  const back = idx > 0 ? () => go(idx - 1) : undefined;
  const fail = (pair: [string, string]) => setStepError(t(pair[0], { defaultValue: pair[1] }));

  const slug = slugDraft.trim().toLowerCase();
  const basicsDirty = !!page && (slug !== page.slug || (aboutDraft.trim() || null) !== (page.about ?? null));
  const lookDirty = !!page?.look && !sameLook(lookDraft, page.look);
  const extrasDirty = !!page?.extras && !sameExtras(extrasDraft, page.extras);
  const reviewDirty = isPro && normalizeLink(reviewDraft) !== normalizeLink(reviewSaved);

  const saveBasics = async () => {
    if (!page) return;
    if (!validSlug(slug)) { fail(SAVE_ERRORS.bad_slug); return; }
    setBusy(true);
    const r = await saveBusinessPage(campaign.id, slug, aboutDraft.trim() || null);
    setBusy(false);
    if (!r.ok) { fail(SAVE_ERRORS[r.error]); return; }
    onPageSaved({ ...page, ...r.page });
    next();
  };
  const saveLook = async () => {
    if (!page?.look) return;
    setBusy(true);
    const r = await savePageLook(campaign.id, lookDraft);
    setBusy(false);
    if (!r.ok) { fail(LOOK_ERRORS[r.error]); return; }
    onPageSaved({ ...page, look: r.look });
    next();
  };
  const saveButtons = async () => {
    if (!page?.extras) return;
    setBusy(true);
    if (extrasDirty) {
      const r = await savePageExtras(campaign.id, { ...extrasDraft, wifiSsid: extrasDraft.wifiSsid?.trim() || null });
      if (!r.ok) { setBusy(false); fail(EXTRA_ERRORS[r.error]); return; }
      onPageSaved({ ...page, extras: r.extras });
      setExtrasDraft(r.extras);
    }
    if (reviewDirty) {
      const links = { ...(campaign.socialLinks ?? {}) };
      const v = normalizeLink(reviewDraft);
      if (v) links.googleReview = v; else delete links.googleReview;
      const ok = await Promise.resolve(onUpdateCampaign({ socialLinks: links }));
      if (ok === false) { setBusy(false); fail(['dash.page.errNetwork', "Couldn't save. Check your connection and try again."]); return; }
    }
    setBusy(false);
    next();
  };
  const saveLinks = async () => {
    if (!linksSave.current) { next(); return; }
    setBusy(true);
    const ok = await linksSave.current();
    setBusy(false);
    if (ok) next();
  };

  const unsaved = t('dash.page.unsaved', { defaultValue: 'Unsaved changes' });
  const cont = t('dash.page.continue', { defaultValue: 'Continue' });
  const saveCont = t('dash.page.saveContinue', { defaultValue: 'Save and continue' });

  let body: ReactNode = null;
  let footer: ReactNode = null;
  if (page && step) {
    switch (step.id) {
      case 'profile':
        body = <BasicsFields campaign={campaign} page={page} slugDraft={slugDraft} setSlugDraft={(v) => { setSlugDraft(v); setStepError(null); }}
          aboutDraft={aboutDraft} setAboutDraft={(v) => { setAboutDraft(v); setStepError(null); }} canEdit={canEdit} onOpenSettings={onOpenSettings}
          onPageSaved={onPageSaved} />;
        footer = <StepFooter onBack={back} primary={canEdit && basicsDirty ? saveCont : cont} onPrimary={canEdit && basicsDirty ? () => void saveBasics() : next}
          busy={busy} error={stepError} note={canEdit && basicsDirty ? unsaved : null} />;
        break;
      case 'look':
        body = (
          <ProLockOverlay locked={!isPro} title={t('dash.page.lookPro', { defaultValue: 'Your own colours are a Pro feature' })} onUpgrade={onUpgrade}>
            <LookFields campaign={campaign} draft={lookDraft} setDraft={(l) => { setLookDraft(l); setStepError(null); }} disabled={!canEdit || !isPro} />
          </ProLockOverlay>
        );
        footer = (
          <StepFooter onBack={back} primary={isPro && canEdit && lookDirty ? saveCont : cont} onPrimary={isPro && canEdit && lookDirty ? () => void saveLook() : next}
            busy={busy} error={stepError} note={isPro && canEdit && lookDirty ? unsaved : null} />
        );
        break;
      case 'stories':
        body = <StoriesTab campaign={campaign} stories={stories} loadError={storiesError} onReload={() => setStoriesTick((n) => n + 1)}
          onChange={setStories} isPro={isPro} canEdit={canEdit} onUpgrade={onUpgrade} />;
        footer = <StepFooter onBack={back} primary={cont} onPrimary={next} />;
        break;
      case 'buttons':
        body = <ButtonsFields draft={extrasDraft} setDraft={(x) => { setExtrasDraft(x); setStepError(null); }} review={reviewDraft}
          setReview={(v) => { setReviewDraft(v); setStepError(null); }} isPro={isPro} canEdit={canEdit} onUpgrade={onUpgrade} />;
        footer = <StepFooter onBack={back} primary={canEdit && (extrasDirty || reviewDirty) ? saveCont : cont}
          onPrimary={canEdit && (extrasDirty || reviewDirty) ? () => void saveButtons() : next}
          busy={busy} error={stepError} note={canEdit && (extrasDirty || reviewDirty) ? unsaved : null} />;
        break;
      case 'links':
        body = canEdit ? (
          <ProLockOverlay locked={!isPro} title={t('dash.page.linksPro', { defaultValue: 'Links are a Pro feature' })} onUpgrade={onUpgrade}>
            <LinksSettings campaign={campaign} exclude={['googleReview']} saveRef={linksSave} onDirty={setLinksDirty}
              onUpdated={(updated) => onUpdateCampaign({ socialLinks: updated.socialLinks })} />
          </ProLockOverlay>
        ) : <ReadOnlyNote />;
        footer = <StepFooter onBack={back} primary={isPro && canEdit && linksDirty ? saveCont : cont}
          onPrimary={isPro && canEdit && linksDirty ? () => void saveLinks() : next} busy={busy} note={isPro && canEdit && linksDirty ? unsaved : null} />;
        break;
      case 'qr':
        body = <ShareStep {...props} active={active} pageUrl={pageUrl} on={on} hasSwitch={hasSwitch} switching={switching}
          onTurnOn={() => void toggle(true)} />;
        footer = <StepFooter onBack={back} primary={hasSwitch && !on && canEdit ? t('dash.page.turnOn', { defaultValue: 'Switch my page on' }) : undefined}
          onPrimary={() => void toggle(true)} busy={switching} />;
        break;
      default:
        break;
    }
  }

  const previewPhone = preview && (
    <div className="mx-auto w-[300px] max-w-full h-[628px] max-h-[calc(100vh-7rem)] rounded-[40px] border-[10px] border-[#1F1F1F] bg-[#1F1F1F] shadow-xl overflow-hidden" data-page-preview>
      <PhoneScreen bg={pageTheme(preview.look?.background).bg}>
        <BusinessPageView page={preview} preview />
      </PhoneScreen>
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-500" data-business-panel>
      {/* The page, on or off. */}
      <section className="rounded-2xl border notion-border bg-white p-5 sm:p-6" data-page-hero>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-2xl md:text-3xl font-serif-display font-semibold">{t('dash.page.title', { defaultValue: 'Business page' })}</h1>
            <p className="text-gray-500 text-sm mt-1 max-w-2xl">{t('dash.page.sub', { defaultValue: 'One page and one QR code for your shop. Guests get your stamp card, your menu and your links from it.' })}</p>
          </div>
          {page && hasSwitch && <PageSwitch on={on} busy={switching} disabled={!canEdit} onToggle={() => void toggle()} />}
        </div>
        {page && hasSwitch && (
          <div className={`mt-4 rounded-xl px-4 py-3 text-sm flex items-start gap-2.5 ${on ? 'bg-green-50 text-green-900' : 'bg-[#F7F7F5] text-gray-700'}`} data-page-status={on ? 'on' : 'off'}>
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${on ? 'bg-green-600' : 'bg-gray-400'}`} />
            <span>{on
              ? t('dash.page.statusOn', { defaultValue: 'Live. Guests who scan your QR code see this page.' })
              : t('dash.page.statusOff', { defaultValue: 'Off. Guests who scan your QR code go straight to sign-up, like before. Set up your page, then switch it on.' })}</span>
          </div>
        )}
        {switchError && <p className="text-sm text-red-600 mt-2" data-switch-error>{t('dash.page.switchError', { defaultValue: "Couldn't switch your page. Try again." })}</p>}
        {page && pageUrl && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <code className="text-sm bg-[#F7F7F5] border notion-border rounded-lg px-3 py-2 break-all" data-page-url>{pageUrl.replace(/^https?:\/\//, '')}</code>
            <CopyButton text={pageUrl} label={t('dash.page.copyLink', { defaultValue: 'Copy link' })} testId="page" />
            <button type="button" className={btnLight} onClick={openPage} data-open-page><ExternalLink className="w-4 h-4" />{t('dash.page.openPage', { defaultValue: 'Open page' })}</button>
          </div>
        )}
      </section>

      {pageError && !page && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 flex flex-wrap items-center gap-3" data-page-error>
          <span className="flex-1 min-w-[200px]">{t('dash.page.loadError', { defaultValue: "We couldn't load your Business page. Your QR posters still work with your direct join link." })}</span>
          <button type="button" className={btnLight} onClick={onRetryPage}><RefreshCw className="w-4 h-4" />{t('dash.page.retry', { defaultValue: 'Try again' })}</button>
        </div>
      )}
      {!page && !pageError && (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />{t('dash.page.loading', { defaultValue: 'Loading your page…' })}</div>
      )}
      {/* Without the page (it couldn't load) the classic QR codes are still here. */}
      {pageError && !page && <ShareStep {...props} active={active} pageUrl={null} on={false} hasSwitch={false} switching={false} onTurnOn={() => {}} />}

      {page && (
        <>
          <div ref={topRef} className="flex flex-wrap items-center justify-between gap-3 scroll-mt-4">
            <div className="inline-flex rounded-full bg-[#F1F1EF] p-1" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'setup'} data-page-mode="setup"
                onClick={() => { if (mode !== 'setup') onSection('profile'); }}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${mode === 'setup' ? 'bg-white shadow-sm text-[#37352F]' : 'text-gray-500 hover:text-[#37352F]'}`}>
                <Settings2 className="w-4 h-4" />{t('dash.page.modeSetup', { defaultValue: 'Set up your page' })}
              </button>
              {hasExtras && (
                <button type="button" role="tab" aria-selected={mode === 'feedback'} data-page-mode="feedback" onClick={() => onSection('feedback')}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${mode === 'feedback' ? 'bg-white shadow-sm text-[#37352F]' : 'text-gray-500 hover:text-[#37352F]'}`}>
                  <MessageSquareHeart className="w-4 h-4" />{t('dash.page.modeFeedback', { defaultValue: 'Feedback' })}
                  {props.unreadFeedback > 0 && (
                    <span className="text-[10px] font-bold bg-amber-500 text-white min-w-[18px] h-[18px] px-1 rounded-full inline-flex items-center justify-center" data-feedback-badge>{props.unreadFeedback}</span>
                  )}
                </button>
              )}
            </div>
            {mode === 'setup' && <span className="text-xs font-medium text-gray-500" data-page-progress>{t('dash.page.progress', { done: doneCount, total: steps.length, defaultValue: '{{done}} of {{total}} done' })}</span>}
          </div>

          {mode === 'feedback' ? (
            <FeedbackTab campaign={campaign} feedbackOn={page.extras?.feedbackOn ?? null} canEdit={canEdit}
              onRead={props.onFeedbackRead} onOpenProfile={() => onSection('buttons')} />
          ) : (
            <>
              {!canEdit && <ReadOnlyNote />}
              {/* The steps, as pills. */}
              <nav ref={pillsRef} className="relative -mx-1 px-1 overflow-x-auto no-scrollbar" aria-label={t('dash.page.stepsAria', { defaultValue: 'Steps' })}>
                <ol className="flex items-center gap-1.5 w-max pb-1">
                  {steps.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-1.5">
                      <button type="button" onClick={() => go(i)} data-step-pill={s.id} data-done={s.done ? '1' : '0'} aria-current={i === idx ? 'step' : undefined}
                        className={`inline-flex items-center gap-2 rounded-full pl-1.5 pr-3.5 py-1.5 text-sm font-medium border transition whitespace-nowrap ${
                          i === idx ? 'bg-[#37352F] text-white border-[#37352F] shadow-sm' : 'bg-white notion-border text-[#37352F] hover:bg-[#F7F7F5]'}`}>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          s.done ? 'bg-green-600 text-white' : i === idx ? 'bg-white/20 text-white' : 'bg-[#F1F1EF] text-gray-600'}`}>
                          {s.done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                        </span>
                        {s.label}
                        {s.pro && !isPro && <Lock className="w-3 h-3 opacity-60" />}
                      </button>
                      {i < steps.length - 1 && <span className="w-3 h-px bg-[#D9D8D5]" aria-hidden="true" />}
                    </li>
                  ))}
                </ol>
              </nav>

              <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
                {step && (
                  <StepShell n={idx + 1} total={steps.length} title={step.title} desc={step.desc} pro={step.pro} footer={footer} testId={step.id}>
                    {body}
                  </StepShell>
                )}
                <aside className="hidden lg:block lg:sticky lg:top-6 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">
                    <span>{t('dash.page.preview', { defaultValue: 'Preview' })}</span>
                    {hasSwitch && !on && <span className="normal-case tracking-normal font-medium text-gray-400">{t('dash.page.previewOffShort', { defaultValue: 'Guests see it once it is on' })}</span>}
                  </div>
                  {previewPhone}
                </aside>
              </div>

              {/* Phones: the preview opens on top. */}
              <button type="button" onClick={() => setShowPreview(true)} data-preview-open
                className="lg:hidden fixed right-4 bottom-24 z-30 inline-flex items-center gap-2 rounded-full bg-[#37352F] text-white px-4 py-3 text-sm font-semibold shadow-lg">
                <Eye className="w-4 h-4" />{t('dash.page.previewBtn', { defaultValue: 'Preview' })}
              </button>
              {showPreview && (
                <div className="lg:hidden fixed inset-0 z-[90] bg-black/70 flex flex-col items-center justify-center p-4" role="dialog" aria-modal="true" data-preview-modal
                  onClick={(e) => { if (e.target === e.currentTarget) setShowPreview(false); }}>
                  <button type="button" onClick={() => setShowPreview(false)} aria-label={t('dash.page.closePreview', { defaultValue: 'Close preview' })} data-preview-close
                    className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 text-white px-4 py-2 text-sm font-medium">
                    <X className="w-4 h-4" />{t('dash.page.closePreview', { defaultValue: 'Close preview' })}
                  </button>
                  <div className="max-h-[calc(100vh-7rem)] overflow-hidden">{previewPhone}</div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Step 1: the address and the few words. */
function BasicsFields({ campaign, page, slugDraft, setSlugDraft, aboutDraft, setAboutDraft, canEdit, onOpenSettings, onPageSaved }: {
  campaign: Campaign; page: MyBusinessPage; slugDraft: string; setSlugDraft: (v: string) => void; aboutDraft: string; setAboutDraft: (v: string) => void;
  canEdit: boolean; onOpenSettings: Props['onOpenSettings']; onPageSaved: Props['onPageSaved'];
}) {
  const { t } = useTranslation();
  const slug = slugDraft.trim().toLowerCase();
  const slugOk = validSlug(slug);
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="page-slug" className="text-sm font-medium">{t('dash.page.address', { defaultValue: 'Page address' })}</label>
        <div className="mt-1.5 flex items-stretch rounded-lg border notion-border overflow-hidden focus-within:ring-2 focus-within:ring-[#37352F]/15">
          <span className="bg-[#F7F7F5] text-gray-500 text-sm px-3 flex items-center border-r notion-border whitespace-nowrap">stampfix.app/v/</span>
          <input id="page-slug" data-page-slug value={slugDraft} disabled={!canEdit} maxLength={40}
            onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            className="flex-1 min-w-0 px-3 py-2.5 text-sm outline-none disabled:bg-white disabled:text-gray-500" />
        </div>
        <p className={`text-xs mt-1.5 ${slug && !slugOk ? 'text-amber-700' : 'text-gray-500'}`}>
          {slug && !slugOk
            ? t(SAVE_ERRORS.bad_slug[0], { defaultValue: SAVE_ERRORS.bad_slug[1] })
            : slug !== page.slug
              ? t('dash.page.addressChange', { defaultValue: 'Codes you already printed keep working after a change.' })
              : t('dash.page.addressHint', { defaultValue: 'This is the link in your QR code.' })}
        </p>
      </div>
      <div>
        <label htmlFor="page-about" className="text-sm font-medium">{t('dash.page.about', { defaultValue: 'About your shop' })}</label>
        <textarea id="page-about" data-page-about-input value={aboutDraft} disabled={!canEdit} maxLength={ABOUT_MAX} rows={3}
          onChange={(e) => setAboutDraft(e.target.value)}
          placeholder={t('dash.page.aboutPh', { defaultValue: 'e.g. Specialty coffee and homemade cakes, right by the park.' })}
          className="mt-1.5 w-full border notion-border rounded-lg px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#37352F]/15 disabled:bg-white disabled:text-gray-500" />
        <div className="text-xs text-gray-400 text-right">{aboutDraft.length}/{ABOUT_MAX}</div>
      </div>
      {page.coverPath !== undefined && <PhotosFields campaign={campaign} page={page} canEdit={canEdit} onPageSaved={onPageSaved} />}
      {/* What comes from the card, in one line. */}
      <div className="rounded-xl bg-[#F7F7F5] p-4 flex flex-wrap items-center gap-3" data-from-card>
        <span className="w-10 h-10 rounded-full bg-white border notion-border overflow-hidden flex items-center justify-center text-lg shrink-0">
          {campaign.logoImage ? <img src={campaign.logoImage} alt="" className="w-full h-full object-contain p-1" />
            : campaign.customIcon ? <span aria-hidden="true">{campaign.customIcon}</span> : <Store className="w-4 h-4 text-gray-500" />}
        </span>
        <div className="flex-1 min-w-[160px]">
          <div className="text-sm font-medium truncate">{campaign.businessName}</div>
          <div className="text-xs text-gray-500">{t('dash.page.fromCardShort', { defaultValue: 'Logo, name and reward come from your stamp card.' })}</div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={`${btnLight} !px-2.5 !py-1.5 text-xs`} onClick={() => onOpenSettings('general')}>{t('dash.page.editNameReward', { defaultValue: 'Name and reward' })}</button>
            <button type="button" className={`${btnLight} !px-2.5 !py-1.5 text-xs`} onClick={() => onOpenSettings('wallet')}>{t('dash.page.editLogoColours', { defaultValue: 'Logo and colours' })}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const PHOTO_ERRORS: Record<string, [string, string]> = {
  unreadable: ['dash.page.photoErrUnreadable', "We couldn't open this photo. Use a JPG or PNG (on iPhone: share it as JPG)."],
  too_big: ['dash.page.photoErrBig', 'This photo is too big. Try another one.'],
  failed: ['dash.page.photoErrFailed', 'Something went wrong with this photo. Try again or use another one.'],
  upload: ['dash.page.photoErrUpload', 'The upload failed. Check your connection and try again.'],
  bad_file: ['dash.page.photoErrUpload', 'The upload failed. Check your connection and try again.'],
  no_page: ['dash.page.photoErrUpload', 'The upload failed. Check your connection and try again.'],
  network: ['dash.page.photoErrUpload', 'The upload failed. Check your connection and try again.'],
};

/** Header photo and profile photo (every plan). They save as soon as they are picked. */
function PhotosFields({ campaign, page, canEdit, onPageSaved }: {
  campaign: Campaign; page: MyBusinessPage; canEdit: boolean; onPageSaved: Props['onPageSaved'];
}) {
  const { t } = useTranslation();
  const coverRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<PagePhotoKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(page);
  latest.current = page;
  const fail = (code: string) => { const e = PHOTO_ERRORS[code] ?? PHOTO_ERRORS.failed; setError(t(e[0], { defaultValue: e[1] })); };
  const apply = (kind: PagePhotoKind, path: string | null) =>
    onPageSaved({ ...latest.current, ...(kind === 'cover' ? { coverPath: path } : { avatarPath: path }) });

  const pick = async (kind: PagePhotoKind, file: File) => {
    setError(null);
    setBusy(kind);
    try {
      const photo = await preparePagePhoto(file, kind);
      const r = await setPagePhoto(campaign.id, kind, photo);
      if (r.ok) apply(kind, r.path); else fail(r.error);
    } catch (e) {
      fail(e instanceof PagePhotoPrepFailed ? e.code : 'failed');
    } finally {
      setBusy(null);
    }
  };
  const remove = async (kind: PagePhotoKind) => {
    setError(null);
    setBusy(kind);
    const r = await setPagePhoto(campaign.id, kind, null);
    setBusy(null);
    if (r.ok) apply(kind, null); else fail(r.error);
  };

  const cover = page.coverPath ? pagePhotoUrl(page.coverPath) : null;
  const avatar = page.avatarPath ? pagePhotoUrl(page.avatarPath) : null;
  const small = `${btnLight} !px-2.5 !py-1.5 text-xs`;
  const spinner = <span className="absolute inset-0 bg-white/60 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#37352F]" /></span>;
  const buttons = (kind: PagePhotoKind, has: boolean, ref: React.RefObject<HTMLInputElement | null>) => canEdit && (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={small} disabled={!!busy} onClick={() => ref.current?.click()} data-photo-pick={kind}>
        <ImagePlus className="w-3.5 h-3.5" />{has ? t('dash.page.photoChange', { defaultValue: 'Change' }) : t('dash.page.photoUpload', { defaultValue: 'Upload' })}
      </button>
      {has && (
        <button type="button" className={`${small} !text-gray-500`} disabled={!!busy} onClick={() => void remove(kind)} data-photo-remove={kind}
          aria-label={t('dash.page.photoRemove', { defaultValue: 'Remove' })}>
          <Trash2 className="w-3.5 h-3.5" />{t('dash.page.photoRemove', { defaultValue: 'Remove' })}
        </button>
      )}
    </div>
  );
  const input = (kind: PagePhotoKind, ref: React.RefObject<HTMLInputElement | null>) => (
    <input ref={ref} type="file" accept="image/*" className="hidden" data-photo-file={kind}
      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(kind, f); }} />
  );

  return (
    <div data-page-photos>
      <div className="text-sm font-medium">{t('dash.page.photos', { defaultValue: 'Photos' })}</div>
      <p className="text-xs text-gray-500 mt-0.5">{t('dash.page.photosHint', { defaultValue: 'Optional. They make your page feel like your place. They save straight away.' })}</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-5 items-start">
        <div className="space-y-2 min-w-0" data-photo-slot="cover">
          <div className="relative aspect-[3/1] rounded-xl overflow-hidden border notion-border">
            {cover
              ? <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" data-photo-img="cover" />
              : (
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: pageBanner(campaign.primaryColor) }}>
                  <span className="text-[11px] font-medium text-white/90 bg-black/20 rounded-full px-2.5 py-1">{t('dash.page.coverNone', { defaultValue: 'Your colour shows until you add a photo' })}</span>
                </div>
              )}
            {busy === 'cover' && spinner}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t('dash.page.cover', { defaultValue: 'Header photo' })}</div>
              <div className="text-xs text-gray-500">{t('dash.page.coverHint', { defaultValue: 'A wide photo of your shop, your food or your team.' })}</div>
            </div>
            {buttons('cover', !!cover, coverRef)}
          </div>
          {input('cover', coverRef)}
        </div>
        <div className="space-y-2" data-photo-slot="avatar">
          <div className="relative w-24 h-24 rounded-[22px] overflow-hidden border notion-border bg-white flex items-center justify-center text-3xl">
            {avatar
              ? <img src={avatar} alt="" className="w-full h-full object-cover" data-photo-img="avatar" />
              : campaign.logoImage ? <img src={campaign.logoImage} alt="" className="w-full h-full object-contain p-2" />
                : campaign.customIcon ? <span aria-hidden="true">{campaign.customIcon}</span> : <Store className="w-7 h-7 text-gray-400" />}
            {busy === 'avatar' && spinner}
          </div>
          <div className="text-sm font-semibold">{t('dash.page.avatar', { defaultValue: 'Profile photo' })}</div>
          <div className="text-xs text-gray-500 max-w-[200px]">{t('dash.page.avatarHint', { defaultValue: 'Square works best. Shows instead of your card logo.' })}</div>
          {buttons('avatar', !!avatar, avatarRef)}
          {input('avatar', avatarRef)}
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mt-2" role="alert" data-photo-error>{error}</p>}
    </div>
  );
}

/** Last step: the QR code(s), posters, the counter code and the rest. */
function ShareStep({ campaign, page, pageError, onPageSaved, canEdit, isPro, orderingEnabled, onUpgrade, onUpdateCampaign, onDownloadPoster, joinUrlForLocation,
  stampUrlForLocation, onOpenSettings, onOpenAddons, onMarkOnboardingStep, onboarding, active, pageUrl, on, hasSwitch, switching, onTurnOn }: Props & {
    active: Location[]; pageUrl: string | null; on: boolean; hasSwitch: boolean; switching: boolean; onTurnOn: () => void;
  }) {
  const { t } = useTranslation();
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const multi = active.length > 1;
  const markPrinted = () => { if (!onboarding.page_qr_downloaded) void onMarkOnboardingStep({ page_qr_downloaded: true }); };
  const download = (loc: Location | null, lang: 'en' | 'de') => { onDownloadPoster(loc, 'loyalty', lang); markPrinted(); };
  const selfServe = campaign.stampingMode === 'self_serve';
  const newCode = async () => {
    setCodeBusy(true); setCodeError(null);
    const r = await setCounterCode(campaign.id, null);
    setCodeBusy(false);
    if (!r.ok) { setCodeError(t('dash.page.codeError', { defaultValue: "Couldn't change the code. Try again." })); return; }
    if (page) onPageSaved({ ...page, counterCode: r.code });
  };
  const box = 'rounded-xl border notion-border p-4 sm:p-5';

  return (
    <div className="space-y-6" data-share-step>
      {/* Where the code leads right now. */}
      {page && hasSwitch && (on ? (
        <div className="rounded-xl bg-green-50 text-green-900 text-sm px-4 py-3 flex items-start gap-2" data-share-status="on">
          <Check className="w-4 h-4 mt-0.5 shrink-0" />{t('dash.page.shareOn', { defaultValue: 'Your page is on. Guests who scan this code see your page.' })}
        </div>
      ) : (
        <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-4 flex flex-wrap items-center gap-3" data-share-status="off">
          <div className="flex-1 min-w-[220px] text-sm">
            <div className="font-semibold">{t('dash.page.offTitle', { defaultValue: 'Your page is off' })}</div>
            <p className="mt-0.5">{t('dash.page.offText', { defaultValue: 'For now this code takes guests straight to sign-up. Switch your page on and the same code opens your page. No need to print again.' })}</p>
          </div>
          {canEdit && (
            <button type="button" className={btnDark} onClick={onTurnOn} disabled={switching} data-share-turn-on>
              {switching && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.page.turnOn', { defaultValue: 'Switch my page on' })}
            </button>
          )}
        </div>
      ))}

      {/* The one QR code (one per branch for shops with several). */}
      <div className="space-y-3">
        <p className="text-sm text-gray-500">{multi
          ? t('dash.page.qrHintMulti', { defaultValue: 'One code per branch. Put it on tables, the door and the counter. Guests get your card, menu and links from it.' })
          : t('dash.page.qrHint', { defaultValue: 'Put it on tables, the door and the counter. Guests get your card, menu and links from it.' })}</p>
        {page || pageError ? (
          <div className={`grid gap-4 ${multi ? 'sm:grid-cols-2' : ''}`}>
            {(multi ? active : [active[0] ?? null]).map((loc) => {
              // Without the page (it couldn't load), the classic join QR, exactly as before.
              const url = page && pageUrl ? businessPageUrl(page.slug, { locationId: multi ? loc?.id : null }) : joinUrlForLocation(loc?.id ?? null);
              return (
                <div key={loc?.id ?? 'shop'} className={`${box} flex flex-col sm:flex-row items-center gap-5`} data-page-qr={loc?.id ?? 'shop'}>
                  <div className="p-3 bg-white border-2 border-dashed border-gray-200 rounded-xl shrink-0">
                    <QRCode value={url} size={148} data-qr-value={url} />
                  </div>
                  <div className="flex-1 min-w-0 w-full space-y-3 text-center sm:text-left">
                    <div>
                      <h3 className="font-serif-display text-lg font-semibold">{campaign.businessName}</h3>
                      {multi && loc && <p className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"><MapPin className="w-3 h-3" />{loc.name}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button type="button" className={`${btnDark} !px-2 !py-2 text-xs`} onClick={() => download(loc, 'en')} data-download="en"><Download className="w-3.5 h-3.5" />{t('dash.page.posterEn', { defaultValue: 'Poster · EN' })}</button>
                      <button type="button" className={`${btnDark} !px-2 !py-2 text-xs`} onClick={() => download(loc, 'de')} data-download="de"><Download className="w-3.5 h-3.5" />{t('dash.page.posterDe', { defaultValue: 'Poster · DE' })}</button>
                      <CopyButton text={url} label={t('dash.page.copyLink', { defaultValue: 'Copy link' })} testId={loc?.id ?? 'shop'} small />
                      <a href={url} target="_blank" rel="noopener noreferrer" className={`${btnLight} !px-2.5 !py-1.5 text-xs`}><ExternalLink className="w-3.5 h-3.5" />{t('dash.page.open', { defaultValue: 'Open' })}</a>
                    </div>
                    <p className="text-[11px] text-gray-400 break-all">{url}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t('dash.page.qrWaiting', { defaultValue: 'Your QR code shows here once your page has loaded.' })}</p>
        )}
      </div>

      {/* Stamping from the page. */}
      <div className={`${box} space-y-3`} data-counter-card>
        <div className="flex items-center gap-2"><Stamp className="w-5 h-5" /><h3 className="font-semibold">{t('dash.page.counterTitle', { defaultValue: 'Stamps from your page' })}</h3></div>
        {selfServe ? (
          page?.counterCode ? (
            <>
              <p className="text-sm text-gray-500 max-w-2xl">{t('dash.page.counterHint', { defaultValue: 'Guests tap "Collect a stamp" on your page and type this code. Keep it at the till where paying customers see it. We still check they are at your shop, and the usual daily limit applies.' })}</p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-4xl font-bold tracking-[0.3em] text-[#37352F] tabular-nums" data-counter-code-value>{page.counterCode}</div>
                <button type="button" className={`${btnDark} text-xs`} onClick={() => downloadCounterCodePng(campaign, page.counterCode!, 'en')} data-counter-download="en"><Download className="w-4 h-4" />{t('dash.page.counterCardEn', { defaultValue: 'Counter card · EN' })}</button>
                <button type="button" className={`${btnDark} text-xs`} onClick={() => downloadCounterCodePng(campaign, page.counterCode!, 'de')} data-counter-download="de"><Download className="w-4 h-4" />{t('dash.page.counterCardDe', { defaultValue: 'Counter card · DE' })}</button>
                {canEdit && (
                  <button type="button" className={btnLight} disabled={codeBusy} onClick={() => void newCode()} data-counter-new>
                    {codeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{t('dash.page.newCode', { defaultValue: 'New code' })}
                  </button>
                )}
              </div>
              {codeError && <p className="text-sm text-red-600">{codeError}</p>}
              <p className="text-xs text-gray-400">{hasSwitch && !on
                ? t('dash.page.counterOffNote', { defaultValue: 'Works once your page is on.' })
                : t('dash.page.counterNotCashier', { defaultValue: 'This is not your private cashier code for extra stamps. That one stays private.' })}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">{t('dash.page.qrWaiting', { defaultValue: 'Your QR code shows here once your page has loaded.' })}</p>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-500 flex-1 min-w-[220px]">{t('dash.page.counterOff', { defaultValue: 'Your staff give stamps by scanning the guest’s card. To let guests collect a stamp from your page themselves, switch on self-serve stamping.' })}</p>
            {canEdit && <button type="button" className={btnLight} onClick={() => onOpenSettings('stamping')}>{t('dash.page.stampingSettings', { defaultValue: 'Stamping settings' })}</button>}
          </div>
        )}
      </div>

      {orderingEnabled && (
        <div className={`${box} flex flex-wrap items-center gap-3`} data-table-codes>
          <UtensilsCrossed className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <h3 className="font-semibold">{t('dash.page.tablesTitle', { defaultValue: 'Table QR codes' })}</h3>
            <p className="text-sm text-gray-500">{t('dash.page.tablesHint', { defaultValue: 'Each table gets its own code. It opens your page at that table, with ordering first.' })}</p>
          </div>
          <button type="button" className={btnLight} onClick={onOpenAddons}>{t('dash.page.tablesBtn', { defaultValue: 'Table codes' })}<ChevronRight className="w-4 h-4" /></button>
        </div>
      )}

      {canEdit && (
        <details className={`${box} group`} data-poster-options>
          <summary className="cursor-pointer select-none font-medium flex items-center gap-2">
            <ChevronRight className="w-4 h-4 transition group-open:rotate-90" />{t('dash.page.morePoster', { defaultValue: 'Poster colours and more sizes' })}
          </summary>
          <div className="mt-4">
            <PosterSettings campaign={campaign} onUpdated={(updated) => onUpdateCampaign({ posterColor: updated.posterColor })}
              isPro={isPro} onUpgrade={onUpgrade} pageUrl={pageUrl} onDownloaded={markPrinted}
              stampUrl={active[0] ? stampUrlForLocation(active[0].id) : null} />
          </div>
        </details>
      )}

      {/* The links from before: they keep working, so they stay available. */}
      <details className={`${box} group`} data-older-links>
        <summary className="cursor-pointer select-none font-medium flex items-center gap-2">
          <ChevronRight className="w-4 h-4 transition group-open:rotate-90" /><Link2 className="w-4 h-4 text-gray-400" />{t('dash.page.olderTitle', { defaultValue: 'Direct links (still work)' })}
        </summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-500 max-w-2xl">{t('dash.page.olderHint', { defaultValue: 'These open the sign-up form or the stamp screen directly, without your page. Codes you printed with them keep working.' })}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {(active.length > 0 ? active : [null]).map((loc) => {
              const join = joinUrlForLocation(loc?.id ?? null);
              const stampUrl = stampUrlForLocation(loc?.id ?? null);
              return (
                <div key={loc?.id ?? 'campaign-wide'} className="rounded-lg border notion-border p-4 space-y-4" data-older-loc={loc?.id ?? 'shop'}>
                  {loc && active.length > 1 && <div className="text-xs font-medium uppercase tracking-wider text-gray-500 inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</div>}
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-white border notion-border rounded-lg shrink-0"><QRCode value={join} size={96} /></div>
                    <div className="space-y-2 min-w-0">
                      <div className="text-sm font-medium">{t('dash.page.joinLink', { defaultValue: 'Join link' })}</div>
                      <CopyButton text={join} label={t('dash.page.copyLink', { defaultValue: 'Copy link' })} testId={`join-${loc?.id ?? 'shop'}`} small />
                      <div className="text-[10px] text-gray-400 break-all">{join}</div>
                    </div>
                  </div>
                  {selfServe && (
                    <div className="flex items-start gap-4 pt-3 border-t notion-border">
                      <div className="p-2 bg-white border notion-border rounded-lg shrink-0"><QRCode value={stampUrl} size={96} /></div>
                      <div className="space-y-2 min-w-0">
                        <div className="text-sm font-medium">{t('dash.page.stampQr', { defaultValue: 'Counter stamp QR' })}</div>
                        <p className="text-xs text-gray-500">{t('dash.page.stampQrHint', { defaultValue: 'Keep behind the counter and show it on request.' })}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <CopyButton text={stampUrl} label={t('dash.page.copyStampLink', { defaultValue: 'Copy stamp link' })} testId={`stamp-${loc?.id ?? 'shop'}`} small />
                          <button type="button" className={`${btnDark} !px-2.5 !py-1.5 text-xs`} onClick={() => onDownloadPoster(loc, 'selfscan', 'en')}>{t('dash.page.stampPosterEn', { defaultValue: 'Stamp poster · EN' })}</button>
                          <button type="button" className={`${btnDark} !px-2.5 !py-1.5 text-xs`} onClick={() => onDownloadPoster(loc, 'selfscan', 'de')}>{t('dash.page.stampPosterDe', { defaultValue: 'Stamp poster · DE' })}</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </details>
    </div>
  );
}
