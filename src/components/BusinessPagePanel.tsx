import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-qr-code';
import {
  Check, Copy, ExternalLink, Loader2, QrCode, Link2, Store, RefreshCw, Download, ChevronRight, MapPin, Lock, UtensilsCrossed, Stamp,
  CircleDot, MessageSquareHeart,
} from 'lucide-react';
import type { Campaign, Location } from '../types';
import type { OnboardingState } from '../lib/db';
import type { PosterSize } from '../services/posterGenerator';
import {
  businessPageUrl, saveBusinessPage, setCounterCode, validSlug, ABOUT_MAX, getMyPageStories, DEFAULT_LOOK,
  type MyBusinessPage, type PublicBusinessPage, type SavePageError, type MyPageStory, type PageLook, type PageExtras,
} from '../lib/businessPage';
import { downloadCounterCodePng } from '../services/posterImage';
import { BusinessPageView, pageTheme } from './BusinessPage';
import { ExtrasCard, LookCard } from './BusinessPageLook';
import { StoriesTab } from './BusinessPageStories';
import { FeedbackTab } from './BusinessPageFeedback';
import { LinksSettings } from './LinksSettings';
import { PosterSettings } from './PosterSettings';
import { ProLockOverlay } from './ProLockOverlay';

export type PageSection = 'profile' | 'stories' | 'links' | 'feedback' | 'qr';

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
  onUpdateCampaign: (patch: Partial<Campaign>) => void;
  onboarding: OnboardingState;
  onMarkOnboardingStep: (patch: Partial<OnboardingState>) => Promise<void> | void;
  onDownloadPoster: (location: Location | null, size: PosterSize, lang: 'en' | 'de') => void;
  joinUrlForLocation: (locationId: string | null) => string;
  stampUrlForLocation: (locationId: string | null) => string;
  onOpenSettings: (section: 'general' | 'wallet' | 'stamping') => void;
  onOpenAddons: () => void;
  /** Feedback guests sent that the owner hasn't seen (for the tab's badge). */
  unreadFeedback: number;
  onFeedbackRead: () => void;
}

const card = 'bg-white rounded-xl border notion-border p-5 sm:p-6';
const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-3.5 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 transition disabled:opacity-50';
const btnLight = 'inline-flex items-center justify-center gap-1.5 bg-white border notion-border text-[#37352F] px-3.5 py-2 rounded-md text-sm font-medium hover:bg-[#F7F7F5] transition disabled:opacity-50';

function CopyButton({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button type="button" data-copy={testId} className={done ? `${btnLight} !bg-green-50 !border-green-200 !text-green-700` : btnLight}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be blocked */ }
        setDone(true); setTimeout(() => setDone(false), 2000);
      }}>
      {done ? <><Check className="w-4 h-4" />{t('dash.page.copied', { defaultValue: 'Copied' })}</> : <><Copy className="w-4 h-4" />{label}</>}
    </button>
  );
}

export function BusinessPagePanel(props: Props) {
  const {
    campaign, locations, page, pageError, onRetryPage, onPageSaved, section, onSection, isPro, canEdit, orderingEnabled,
    onUpgrade, onUpdateCampaign, onboarding, onMarkOnboardingStep, onOpenSettings,
  } = props;
  const { t } = useTranslation();
  const active = useMemo(() => locations.filter((l) => !l.archived), [locations]);
  const [aboutDraft, setAboutDraft] = useState(page?.about ?? '');
  useEffect(() => { setAboutDraft(page?.about ?? ''); }, [page?.about]);
  // Stories and the extras need the second database update; until then their tabs stay hidden.
  const hasStories = !!page?.look;
  const hasExtras = !!page?.extras;
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

  const pageUrl = page ? businessPageUrl(page.slug) : null;
  const links = campaign.socialLinks ?? {};
  const hasLinks = Object.values(links).some((v) => typeof v === 'string' && v.trim() !== '');
  const openPage = () => {
    if (!pageUrl) return;
    window.open(pageUrl, '_blank', 'noopener');
    if (!onboarding.page_previewed) void onMarkOnboardingStep({ page_previewed: true });
  };

  const steps = [
    { key: 'logo', done: !!campaign.logoImage, label: t('dash.page.stepLogo', { defaultValue: 'Add your logo' }),
      action: t('dash.page.stepLogoBtn', { defaultValue: 'Add logo' }), go: () => onOpenSettings('wallet') },
    { key: 'about', done: !!page?.about, label: t('dash.page.stepAbout', { defaultValue: 'Say a few words about your shop' }),
      action: t('dash.page.stepAboutBtn', { defaultValue: 'Write it' }), go: () => onSection('profile') },
    ...(isPro ? [{ key: 'links', done: hasLinks, label: t('dash.page.stepLinks', { defaultValue: 'Add your links (website, Google reviews, Instagram)' }),
      action: t('dash.page.stepLinksBtn', { defaultValue: 'Add links' }), go: () => onSection('links') }] : []),
    ...(isPro && hasStories && stories ? [{ key: 'story', done: stories.length > 0, label: t('dash.page.stepStory', { defaultValue: 'Add your first story' }),
      action: t('dash.page.stepStoryBtn', { defaultValue: 'Add story' }), go: () => onSection('stories') }] : []),
    { key: 'look', done: !!onboarding.page_previewed, label: t('dash.page.stepLook', { defaultValue: 'Open your page and have a look' }),
      action: t('dash.page.stepLookBtn', { defaultValue: 'Open page' }), go: openPage },
    { key: 'print', done: !!onboarding.page_qr_downloaded, label: t('dash.page.stepPrint', { defaultValue: 'Print your QR code' }),
      action: t('dash.page.stepPrintBtn', { defaultValue: 'Get QR code' }), go: () => onSection('qr') },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" data-business-panel>
      <header className="space-y-3">
        <h1 className="text-3xl md:text-4xl font-serif-display font-semibold">{t('dash.page.title', { defaultValue: 'Business page' })}</h1>
        <p className="text-gray-500 text-sm md:text-base max-w-2xl">{t('dash.page.sub', { defaultValue: 'One page and one QR code for your shop. Guests get your stamp card, your menu and your links from it.' })}</p>
        {page && pageUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 break-all" data-page-url>{pageUrl.replace(/^https?:\/\//, '')}</code>
            <CopyButton text={pageUrl} label={t('dash.page.copyLink', { defaultValue: 'Copy link' })} testId="page" />
            <button type="button" className={btnLight} onClick={openPage} data-open-page><ExternalLink className="w-4 h-4" />{t('dash.page.openPage', { defaultValue: 'Open page' })}</button>
          </div>
        )}
      </header>

      {pageError && !page && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 flex flex-wrap items-center gap-3" data-page-error>
          <span className="flex-1 min-w-[200px]">{t('dash.page.loadError', { defaultValue: "We couldn't load your Business page. Your QR posters still work with your direct join link." })}</span>
          <button type="button" className={btnLight} onClick={onRetryPage}><RefreshCw className="w-4 h-4" />{t('dash.page.retry', { defaultValue: 'Try again' })}</button>
        </div>
      )}
      {!page && !pageError && (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />{t('dash.page.loading', { defaultValue: 'Loading your page…' })}</div>
      )}

      {page && doneCount < steps.length && (
        <section className={card} data-page-checklist>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">{t('dash.page.complete', { defaultValue: 'Complete your page' })}</h2>
            <span className="text-xs font-medium text-gray-500" data-page-progress>{t('dash.page.progress', { done: doneCount, total: steps.length, defaultValue: '{{done}} of {{total}} done' })}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#F1F1EF] overflow-hidden mb-4">
            <div className="h-full rounded-full bg-[#37352F] transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ul className="space-y-2">
            {steps.map((s) => (
              <li key={s.key} data-step={s.key} data-done={s.done ? '1' : '0'} className="flex items-center gap-3 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${s.done ? 'bg-green-600 text-white' : 'border-2 border-gray-300'}`}>
                  {s.done && <Check className="w-3 h-3" />}
                </span>
                <span className={`flex-1 min-w-0 ${s.done ? 'text-gray-400 line-through' : ''}`}>{s.label}</span>
                {!s.done && (canEdit || s.key === 'look' || s.key === 'print') && (
                  <button type="button" onClick={s.go} className="text-sm font-medium text-[#37352F] hover:underline inline-flex items-center gap-0.5 shrink-0">
                    {s.action}<ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b notion-border" role="tablist">
        {([
          ['profile', Store, t('dash.page.tabProfile', { defaultValue: 'Profile' })],
          ...(hasStories ? [['stories', CircleDot, t('dash.page.tabStories', { defaultValue: 'Stories' })] as const] : []),
          ['links', Link2, t('dash.page.tabLinks', { defaultValue: 'Links' })],
          ...(hasExtras ? [['feedback', MessageSquareHeart, t('dash.page.tabFeedback', { defaultValue: 'Feedback' })] as const] : []),
          ['qr', QrCode, t('dash.page.tabQr', { defaultValue: 'QR code & posters' })],
        ] as const).map(([id, Icon, label]) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} data-page-tab={id} onClick={() => onSection(id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              section === id ? 'border-[#37352F] text-[#37352F] font-medium' : 'border-transparent text-gray-500 hover:text-[#37352F]'}`}>
            <Icon className="w-4 h-4" />{label}
            {id === 'stories' && !isPro && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">Pro</span>}
            {id === 'feedback' && props.unreadFeedback > 0 && (
              <span className="text-[10px] font-bold bg-amber-500 text-white min-w-[18px] h-[18px] px-1 rounded-full inline-flex items-center justify-center" data-feedback-badge>{props.unreadFeedback}</span>
            )}
          </button>
        ))}
      </nav>

      {section === 'profile' && (
        <ProfileTab {...props} aboutDraft={aboutDraft} setAboutDraft={setAboutDraft} active={active} stories={stories} />
      )}

      {section === 'stories' && page && (
        hasStories ? (
          <StoriesTab campaign={campaign} stories={stories} loadError={storiesError} onReload={() => setStoriesTick((n) => n + 1)}
            onChange={setStories} isPro={isPro} canEdit={canEdit} onUpgrade={onUpgrade} />
        ) : <p className="text-sm text-gray-500">{t('dash.page.notYet', { defaultValue: 'This part of your page is being set up. Please check back soon.' })}</p>
      )}

      {section === 'feedback' && page && (
        hasExtras ? (
          <FeedbackTab campaign={campaign} feedbackOn={page.extras?.feedbackOn ?? null} canEdit={canEdit}
            onRead={props.onFeedbackRead} onOpenProfile={() => onSection('profile')} />
        ) : <p className="text-sm text-gray-500">{t('dash.page.notYet', { defaultValue: 'This part of your page is being set up. Please check back soon.' })}</p>
      )}

      {section === 'links' && (
        <div className="space-y-3 max-w-2xl">
          <p className="text-sm text-gray-500">{t('dash.page.linksHint', { defaultValue: 'Each link you add shows on your page and on the back of your wallet card.' })}</p>
          {canEdit ? (
            <ProLockOverlay locked={!isPro} title={t('dash.page.linksPro', { defaultValue: 'Links are a Pro feature' })} onUpgrade={onUpgrade}>
              <LinksSettings campaign={campaign} onUpdated={(updated) => onUpdateCampaign({ socialLinks: updated.socialLinks })} />
            </ProLockOverlay>
          ) : <ReadOnlyNote />}
        </div>
      )}

      {section === 'qr' && <QrTab {...props} active={active} pageUrl={pageUrl} />}

      {page && pageUrl && section !== 'qr' && (
        <p className="text-xs text-gray-400">{t('dash.page.oldStillWork', { defaultValue: 'Codes you printed before still work.' })}</p>
      )}
    </div>
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

function ProfileTab({ campaign, page, onPageSaved, canEdit, onOpenSettings, aboutDraft, setAboutDraft, active, orderingEnabled, isPro, onUpgrade, onSection, stories }: Props & {
  aboutDraft: string; setAboutDraft: (v: string) => void; active: Location[]; stories: MyPageStory[] | null;
}) {
  const { t } = useTranslation();
  const [slugDraft, setSlugDraft] = useState(page?.slug ?? '');
  useEffect(() => { setSlugDraft(page?.slug ?? ''); }, [page?.slug]);
  // Drafts of the look and the buttons, so the preview changes as you pick.
  const [lookDraft, setLookDraft] = useState<PageLook>(page?.look ?? DEFAULT_LOOK);
  const lookKey = page?.look ? `${page.look.accentColor}|${page.look.background}|${page.look.headingStyle}` : '';
  useEffect(() => { if (page?.look) setLookDraft(page.look); }, [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [extrasDraft, setExtrasDraft] = useState<PageExtras | null>(page?.extras ?? null);
  const extrasKey = page?.extras ? JSON.stringify(page.extras) : '';
  useEffect(() => { if (page?.extras) setExtrasDraft(page.extras); }, [extrasKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!page) return null;

  const slug = slugDraft.trim().toLowerCase();
  const dirty = slug !== page.slug || (aboutDraft.trim() || null) !== (page.about ?? null);
  const slugOk = validSlug(slug);
  const save = async () => {
    if (!slugOk) { setError(t(SAVE_ERRORS.bad_slug[0], { defaultValue: SAVE_ERRORS.bad_slug[1] })); return; }
    setSaving(true); setError(null); setSaved(false);
    const r = await saveBusinessPage(campaign.id, slug, aboutDraft.trim() || null);
    setSaving(false);
    if (!r.ok) { const [k, d] = SAVE_ERRORS[r.error]; setError(t(k, { defaultValue: d })); return; }
    onPageSaved({ ...page, ...r.page });
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };
  const preview: PublicBusinessPage = {
    campaignId: campaign.id, merchantId: campaign.merchantId, slug: page.slug, businessName: campaign.businessName,
    offerTitle: campaign.offerTitle || null, maxStamps: campaign.maxStamps || null, logoImage: campaign.logoImage ?? null,
    logoMode: campaign.logoMode ?? null, customIcon: campaign.customIcon || null, primaryColor: campaign.primaryColor || null,
    cardColor: null, cardTextColor: campaign.cardTextColor ?? null, about: aboutDraft.trim() || null,
    links: Object.fromEntries(Object.entries(campaign.socialLinks ?? {}).filter(([, v]) => typeof v === 'string' && v.trim() !== '')),
    approved: true, available: true, selfServe: campaign.stampingMode === 'self_serve' && !!page.counterCode,
    orderingOpen: orderingEnabled, locations: active.map((l) => ({ id: l.id, name: l.name })),
    look: isPro && page.look ? lookDraft : null,
    stories: isPro ? (stories ?? []).filter((s) => !s.hidden) : [],
    wifi: extrasDraft?.wifiSsid?.trim() ? { ssid: extrasDraft.wifiSsid.trim(), password: extrasDraft.wifiPassword || null } : null,
    feedbackOn: !!extrasDraft?.feedbackOn,
    gameOn: !!extrasDraft?.gameOn,
  };
  const hasReviewLink = !!(campaign.socialLinks?.googleReview ?? '').trim();

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
      <div className="space-y-5 min-w-0">
        {!canEdit && <ReadOnlyNote />}
        <section className={`${card} space-y-5`}>
          <div>
            <label htmlFor="page-slug" className="text-sm font-medium">{t('dash.page.address', { defaultValue: 'Page address' })}</label>
            <div className="mt-1.5 flex items-stretch rounded-md border notion-border overflow-hidden focus-within:ring-1 focus-within:ring-gray-300">
              <span className="bg-[#F7F7F5] text-gray-500 text-sm px-3 flex items-center border-r notion-border whitespace-nowrap">stampfix.app/v/</span>
              <input id="page-slug" data-page-slug value={slugDraft} disabled={!canEdit} maxLength={40}
                onChange={(e) => { setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setError(null); }}
                className="flex-1 min-w-0 px-3 py-2 text-sm outline-none disabled:bg-white disabled:text-gray-500" />
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
            <textarea id="page-about" data-page-about-input value={aboutDraft} disabled={!canEdit} maxLength={ABOUT_MAX} rows={4}
              onChange={(e) => { setAboutDraft(e.target.value); setError(null); }}
              placeholder={t('dash.page.aboutPh', { defaultValue: 'e.g. Specialty coffee and homemade cakes, right by the park.' })}
              className="mt-1.5 w-full border notion-border rounded-md px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-gray-300 disabled:bg-white disabled:text-gray-500" />
            <div className="text-xs text-gray-400 text-right">{aboutDraft.length}/{ABOUT_MAX}</div>
          </div>
          {error && <p className="text-sm text-red-600" data-page-save-error>{error}</p>}
          {canEdit && (
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-green-700 inline-flex items-center gap-1" data-page-saved><Check className="w-4 h-4" />{t('dash.page.saved', { defaultValue: 'Saved' })}</span>}
              <button type="button" className={btnDark} disabled={saving || !dirty} onClick={() => void save()} data-page-save>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.page.save', { defaultValue: 'Save' })}
              </button>
            </div>
          )}
        </section>
        {page.extras && extrasDraft && (
          <ExtrasCard campaign={campaign} page={{ ...page, extras: page.extras }} draft={extrasDraft} setDraft={setExtrasDraft}
            canEdit={canEdit} hasReviewLink={hasReviewLink} onOpenLinks={() => onSection('links')} onPageSaved={onPageSaved} />
        )}
        {page.look && (
          <LookCard campaign={campaign} page={{ ...page, look: page.look }} draft={lookDraft} setDraft={setLookDraft}
            isPro={isPro} canEdit={canEdit} onUpgrade={onUpgrade} onPageSaved={onPageSaved} />
        )}
        <section className={`${card} space-y-3`}>
          <h3 className="font-medium">{t('dash.page.fromCard', { defaultValue: 'From your card' })}</h3>
          <p className="text-sm text-gray-500">{t('dash.page.fromCardHint', { defaultValue: 'Your name, reward, logo and colours on the page come from your stamp card, so they always match.' })}</p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnLight} onClick={() => onOpenSettings('general')}>{t('dash.page.editNameReward', { defaultValue: 'Name and reward' })}</button>
              <button type="button" className={btnLight} onClick={() => onOpenSettings('wallet')}>{t('dash.page.editLogoColours', { defaultValue: 'Logo and colours' })}</button>
            </div>
          )}
        </section>
      </div>
      <div className="lg:sticky lg:top-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 text-center">{t('dash.page.preview', { defaultValue: 'Preview' })}</div>
        <div className="mx-auto w-[300px] max-w-full h-[600px] rounded-[38px] border-[10px] border-[#1F1F1F] bg-[#1F1F1F] shadow-xl overflow-hidden" data-page-preview>
          <div className="w-full h-full rounded-[28px] overflow-y-auto overflow-x-hidden" style={{ background: pageTheme(preview.look?.background).bg }}>
            <BusinessPageView page={preview} preview />
          </div>
        </div>
      </div>
    </div>
  );
}

function QrTab({ campaign, page, pageError, onPageSaved, canEdit, isPro, orderingEnabled, onUpgrade, onUpdateCampaign, onDownloadPoster, joinUrlForLocation,
  stampUrlForLocation, onOpenSettings, onOpenAddons, onMarkOnboardingStep, onboarding, active, pageUrl }: Props & { active: Location[]; pageUrl: string | null }) {
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

  return (
    <div className="space-y-6">
      {/* The one QR code (one per branch for shops with several). */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t('dash.page.qrTitle', { defaultValue: 'Your QR code' })}</h2>
          <p className="text-sm text-gray-500 max-w-2xl">{multi
            ? t('dash.page.qrHintMulti', { defaultValue: 'One code per branch. Put it on tables, the door and the counter. Guests get your card, menu and links from it.' })
            : t('dash.page.qrHint', { defaultValue: 'Put it on tables, the door and the counter. Guests get your card, menu and links from it.' })}</p>
        </div>
        {page || pageError ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {(multi ? active : [active[0] ?? null]).map((loc) => {
              // Without the page (it couldn't load), the classic join QR, exactly as before.
              const url = page ? businessPageUrl(page.slug, { locationId: multi ? loc?.id : null }) : joinUrlForLocation(loc?.id ?? null);
              return (
                <div key={loc?.id ?? 'shop'} className={`${card} flex flex-col items-center text-center space-y-4`} data-page-qr={loc?.id ?? 'shop'}>
                  <div className="space-y-1">
                    <h3 className="font-serif-display text-lg font-semibold">{campaign.businessName}</h3>
                    {multi && loc && <p className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-gray-500 bg-[#F7F7F5] px-2.5 py-1 rounded-full border notion-border"><MapPin className="w-3 h-3" />{loc.name}</p>}
                  </div>
                  <div className="p-3 bg-white border-2 border-dashed border-gray-200 rounded-xl">
                    <QRCode value={url} size={160} data-qr-value={url} />
                  </div>
                  <div className="w-full grid grid-cols-2 gap-1.5">
                    <button type="button" className={`${btnDark} text-xs !px-2`} onClick={() => download(loc, 'en')} data-download="en"><Download className="w-3.5 h-3.5" />{t('dash.page.posterEn', { defaultValue: 'Poster · EN' })}</button>
                    <button type="button" className={`${btnDark} text-xs !px-2`} onClick={() => download(loc, 'de')} data-download="de"><Download className="w-3.5 h-3.5" />{t('dash.page.posterDe', { defaultValue: 'Poster · DE' })}</button>
                  </div>
                  <div className="w-full grid grid-cols-2 gap-1.5">
                    <CopyButton text={url} label={t('dash.page.copyLink', { defaultValue: 'Copy link' })} testId={loc?.id ?? 'shop'} />
                    <a href={url} target="_blank" rel="noopener noreferrer" className={btnLight}><ExternalLink className="w-4 h-4" />{t('dash.page.open', { defaultValue: 'Open' })}</a>
                  </div>
                  <p className="text-[11px] text-gray-400 break-all">{url}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t('dash.page.qrWaiting', { defaultValue: 'Your QR code shows here once your page has loaded.' })}</p>
        )}
      </section>

      {/* Stamping from the page. */}
      <section className={`${card} space-y-3`} data-counter-card>
        <div className="flex items-center gap-2"><Stamp className="w-5 h-5" /><h2 className="text-lg font-semibold">{t('dash.page.counterTitle', { defaultValue: 'Stamps from your page' })}</h2></div>
        {selfServe ? (
          page?.counterCode ? (
            <>
              <p className="text-sm text-gray-500 max-w-2xl">{t('dash.page.counterHint', { defaultValue: 'Guests tap "Collect a stamp" on your page and type this code. Keep it at the till where paying customers see it. We still check they are at your shop, and the usual daily limit applies.' })}</p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-4xl font-bold tracking-[0.3em] text-[#37352F] tabular-nums" data-counter-code-value>{page.counterCode}</div>
                <button type="button" className={btnDark} onClick={() => downloadCounterCodePng(campaign, page.counterCode!, 'en')} data-counter-download="en"><Download className="w-4 h-4" />{t('dash.page.counterCardEn', { defaultValue: 'Counter card · EN' })}</button>
                <button type="button" className={btnDark} onClick={() => downloadCounterCodePng(campaign, page.counterCode!, 'de')} data-counter-download="de"><Download className="w-4 h-4" />{t('dash.page.counterCardDe', { defaultValue: 'Counter card · DE' })}</button>
                {canEdit && (
                  <button type="button" className={btnLight} disabled={codeBusy} onClick={() => void newCode()} data-counter-new>
                    {codeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}{t('dash.page.newCode', { defaultValue: 'New code' })}
                  </button>
                )}
              </div>
              {codeError && <p className="text-sm text-red-600">{codeError}</p>}
              <p className="text-xs text-gray-400">{t('dash.page.counterNotCashier', { defaultValue: 'This is not your private cashier code for extra stamps. That one stays private.' })}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">{t('dash.page.qrWaiting', { defaultValue: 'Your QR code shows here once your page has loaded.' })}</p>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 max-w-2xl">{t('dash.page.counterOff', { defaultValue: 'Your staff give stamps by scanning the guest’s card. To let guests collect a stamp from your page themselves, switch on self-serve stamping.' })}</p>
            {canEdit && <button type="button" className={btnLight} onClick={() => onOpenSettings('stamping')}>{t('dash.page.stampingSettings', { defaultValue: 'Stamping settings' })}</button>}
          </div>
        )}
      </section>

      {orderingEnabled && (
        <section className={`${card} flex flex-wrap items-center gap-3`} data-table-codes>
          <UtensilsCrossed className="w-5 h-5 shrink-0" />
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-semibold">{t('dash.page.tablesTitle', { defaultValue: 'Table QR codes' })}</h2>
            <p className="text-sm text-gray-500">{t('dash.page.tablesHint', { defaultValue: 'Each table gets its own code. It opens your page at that table, with ordering first.' })}</p>
          </div>
          <button type="button" className={btnLight} onClick={onOpenAddons}>{t('dash.page.tablesBtn', { defaultValue: 'Table codes' })}<ChevronRight className="w-4 h-4" /></button>
        </section>
      )}

      {canEdit && (
        <PosterSettings campaign={campaign} onUpdated={(updated) => onUpdateCampaign({ posterColor: updated.posterColor })}
          isPro={isPro} onUpgrade={onUpgrade} pageUrl={pageUrl} onDownloaded={markPrinted}
          stampUrl={active[0] ? stampUrlForLocation(active[0].id) : null} />
      )}

      {/* The links from before: they keep working, so they stay available. */}
      <details className={`${card} group`} data-older-links>
        <summary className="cursor-pointer select-none font-medium flex items-center gap-2">
          <ChevronRight className="w-4 h-4 transition group-open:rotate-90" />{t('dash.page.olderTitle', { defaultValue: 'Direct links (still work)' })}
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
                      <CopyButton text={join} label={t('dash.page.copyLink', { defaultValue: 'Copy link' })} testId={`join-${loc?.id ?? 'shop'}`} />
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
                          <CopyButton text={stampUrl} label={t('dash.page.copyStampLink', { defaultValue: 'Copy stamp link' })} testId={`stamp-${loc?.id ?? 'shop'}`} />
                          <button type="button" className={`${btnDark} text-xs`} onClick={() => onDownloadPoster(loc, 'selfscan', 'en')}>{t('dash.page.stampPosterEn', { defaultValue: 'Stamp poster · EN' })}</button>
                          <button type="button" className={`${btnDark} text-xs`} onClick={() => onDownloadPoster(loc, 'selfscan', 'de')}>{t('dash.page.stampPosterDe', { defaultValue: 'Stamp poster · DE' })}</button>
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
