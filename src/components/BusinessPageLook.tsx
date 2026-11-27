import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Star, Wifi, MessageSquareHeart, Gamepad2, AlertTriangle, Lock } from 'lucide-react';
import type { Campaign } from '../types';
import {
  PAGE_BACKGROUNDS,
  type PageLook, type PageExtras, type PageBackground, type SaveLookError, type SaveExtrasError,
} from '../lib/businessPage';
import { pageAccent, pageTheme } from './BusinessPage';

// The fields of two Business page steps (the step itself has the Save button):
//   Look (Pro): button colour, background and heading style.
//   Buttons (every plan): Google review (Pro), Wi-Fi, feedback, game.

const PRESETS = ['#2F2A26', '#1F5C4A', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#B91C1C', '#C2410C', '#CA8A04'];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const BG_LABEL: Record<PageBackground, [string, string]> = {
  cream: ['dash.page.bgCream', 'Cream'], white: ['dash.page.bgWhite', 'White'], stone: ['dash.page.bgStone', 'Stone'], dark: ['dash.page.bgDark', 'Dark'],
};

export const LOOK_ERRORS: Record<SaveLookError, [string, string]> = {
  pro_only: ['dash.page.lookErrPro', 'Your own colours are a Pro feature.'],
  bad_colour: ['dash.page.lookErrColour', 'Use a colour like #1F5C4A.'],
  bad_background: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
  bad_heading: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
  no_page: ['dash.page.errNoPage', "Your page isn't ready yet. Reload and try again."],
  network: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
};

export const EXTRA_ERRORS: Record<SaveExtrasError, [string, string]> = {
  bad_ssid: ['dash.page.wifiErrName', 'Network names are up to 32 characters.'],
  bad_password: ['dash.page.wifiErrPass', 'Wi-Fi passwords are up to 63 characters.'],
  no_page: ['dash.page.errNoPage', "Your page isn't ready yet. Reload and try again."],
  network: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
};

export function sameLook(a: PageLook, b: PageLook): boolean {
  return (a.accentColor ?? '').toUpperCase() === (b.accentColor ?? '').toUpperCase() && a.background === b.background && a.headingStyle === b.headingStyle;
}

export function sameExtras(a: PageExtras, b: PageExtras): boolean {
  return (a.wifiSsid ?? '').trim() === (b.wifiSsid ?? '').trim() && (a.wifiPassword ?? '') === (b.wifiPassword ?? '')
    && a.feedbackOn === b.feedbackOn && a.gameOn === b.gameOn;
}

export function Switch({ on, onChange, disabled, label, testId }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; testId: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} data-switch={testId}
      className={`relative w-11 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${on ? 'bg-green-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

/** Button colour, background and headings. */
export function LookFields({ campaign, draft, setDraft, disabled }: {
  campaign: Campaign; draft: PageLook; setDraft: (l: PageLook) => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  const [hexDraft, setHexDraft] = useState(draft.accentColor ?? '');
  const set = (patch: Partial<PageLook>) => setDraft({ ...draft, ...patch });
  const pick = (hex: string | null) => { set({ accentColor: hex }); setHexDraft(hex ?? ''); };

  // Would the page fall back to its own button colour?
  const wanted = draft.accentColor ?? campaign.primaryColor ?? null;
  const dark = pageTheme(draft.background).dark;
  const shown = pageAccent(wanted, dark);
  const fallback = !!wanted && shown.bg.toUpperCase() !== (wanted.startsWith('#') ? wanted : `#${wanted}`).toUpperCase();

  const swatch = (hex: string | null, label: string, key: string) => {
    const active = hex === null ? draft.accentColor === null : (draft.accentColor ?? '').toUpperCase() === hex.toUpperCase();
    const color = hex ?? campaign.primaryColor ?? '#2F2A26';
    return (
      <button key={key} type="button" disabled={disabled} onClick={() => pick(hex)} aria-label={label} title={label} aria-pressed={active} data-accent={hex ?? 'card'}
        className={`relative w-9 h-9 rounded-full border-2 transition ${active ? 'border-[#37352F] scale-110' : 'border-white shadow-[0_0_0_1px_#E9E9E7] hover:scale-105'}`}
        style={{ background: color }}>
        {active && <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow-[0_0_1.5px_rgba(0,0,0,0.9)]" />}
      </button>
    );
  };

  return (
    <div className="space-y-6" data-look-card>
      <div>
        <div className="text-sm font-medium mb-1">{t('dash.page.buttonColour', { defaultValue: 'Button colour' })}</div>
        <p className="text-xs text-gray-500 mb-3">{draft.accentColor === null
          ? t('dash.page.cardColourHint', { defaultValue: 'Uses the colour of your stamp card.' })
          : t('dash.page.ownColourHint', { defaultValue: 'Your own colour for the buttons on your page.' })}</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {swatch(null, t('dash.page.cardColour', { defaultValue: 'Same as my card' }), 'card')}
          <span className="w-px h-7 bg-[#E9E9E7] mx-0.5" aria-hidden="true" />
          {PRESETS.map((h) => swatch(h, h, h))}
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-500">
          <input type="color" disabled={disabled} value={HEX_RE.test(hexDraft) ? hexDraft : (wanted && HEX_RE.test(wanted) ? wanted : '#2F2A26')}
            onChange={(e) => pick(e.target.value.toUpperCase())} aria-label={t('dash.page.pickColour', { defaultValue: 'Pick a colour' })}
            className="w-8 h-8 rounded-full border notion-border cursor-pointer bg-white p-0.5" />
          {t('dash.page.orHex', { defaultValue: 'or type one' })}
          <input value={hexDraft} disabled={disabled} maxLength={7} placeholder="#1F5C4A" data-accent-hex
            onChange={(e) => {
              const v = e.target.value.trim();
              setHexDraft(v);
              const full = v.startsWith('#') ? v : `#${v}`;
              if (HEX_RE.test(full)) set({ accentColor: full.toUpperCase() });
            }}
            className="w-24 border notion-border rounded-md px-2 py-1.5 text-sm font-mono uppercase text-[#37352F] disabled:bg-white" />
        </label>
        {fallback && (
          <p className="text-xs text-amber-700 mt-2 flex items-start gap-1.5" data-look-contrast>
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {dark
              ? t('dash.page.tooDark', { defaultValue: 'This colour is too dark to see on the dark page, so your buttons will be light instead.' })
              : t('dash.page.tooLight', { defaultValue: 'This colour is too light for buttons, so your buttons will be dark instead.' })}
          </p>
        )}
      </div>
      <div>
        <div className="text-sm font-medium mb-3">{t('dash.page.background', { defaultValue: 'Background' })}</div>
        <div className="grid grid-cols-4 gap-2 max-w-md">
          {PAGE_BACKGROUNDS.map((bg) => {
            const th = pageTheme(bg);
            const active = draft.background === bg;
            return (
              <button key={bg} type="button" disabled={disabled} onClick={() => set({ background: bg })} aria-pressed={active} data-bg={bg}
                className={`rounded-xl border-2 p-1.5 text-xs font-medium transition ${active ? 'border-[#37352F]' : 'border-[#E9E9E7] hover:border-gray-300'}`}>
                <span className="block h-12 rounded-lg relative overflow-hidden" style={{ background: th.bg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }}>
                  <span className="absolute left-2 right-2 top-2 h-2 rounded-full" style={{ background: th.dark ? '#F4F1EC' : '#2F2A26', opacity: 0.7 }} />
                  <span className="absolute left-2 right-2 bottom-2 h-4 rounded" style={{ background: th.card, border: `1px solid ${th.border}` }} />
                </span>
                <span className="block mt-1.5">{t(BG_LABEL[bg][0], { defaultValue: BG_LABEL[bg][1] })}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium mb-3">{t('dash.page.headings', { defaultValue: 'Headings' })}</div>
        <div className="flex gap-2">
          {(['serif', 'sans'] as const).map((h) => (
            <button key={h} type="button" disabled={disabled} onClick={() => set({ headingStyle: h })} aria-pressed={draft.headingStyle === h} data-heading={h}
              className={`rounded-xl border-2 px-5 py-2.5 transition ${draft.headingStyle === h ? 'border-[#37352F]' : 'border-[#E9E9E7] hover:border-gray-300'}`}>
              <span className={`block text-2xl leading-none ${h === 'serif' ? 'font-serif-display font-semibold' : 'font-bold tracking-tight'}`}>Aa</span>
              <span className="block text-xs text-gray-500 mt-1">{h === 'serif' ? t('dash.page.headClassic', { defaultValue: 'Classic' }) : t('dash.page.headModern', { defaultValue: 'Modern' })}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One row of the Buttons step: icon, name, what it does, and its switch or field. */
function Row({ icon: Icon, title, hint, right, children, testId, pro }: {
  icon: typeof Star; title: string; hint: string; right?: React.ReactNode; children?: React.ReactNode; testId: string; pro?: boolean;
}) {
  return (
    <div className="rounded-xl border notion-border p-4" data-extra={testId}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-[#F7F7F5] flex items-center justify-center shrink-0"><Icon className="w-[18px] h-[18px] text-[#37352F]" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">{title}
            {pro && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">Pro</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
        </div>
        {right}
      </div>
      {children && <div className="mt-3 sm:pl-12">{children}</div>}
    </div>
  );
}

/** Google review (Pro), Wi-Fi, feedback and the game. */
export function ButtonsFields({ draft, setDraft, review, setReview, isPro, canEdit, onUpgrade }: {
  draft: PageExtras; setDraft: (x: PageExtras) => void; review: string; setReview: (v: string) => void;
  isPro: boolean; canEdit: boolean; onUpgrade: () => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<PageExtras>) => setDraft({ ...draft, ...patch });
  const wifiOn = draft.wifiSsid !== null;
  const input = 'w-full border notion-border rounded-md px-3 py-2 text-sm disabled:bg-[#F7F7F5] disabled:text-gray-400';
  return (
    <div className="space-y-3" data-extras-card>
      <Row icon={Star} testId="review" pro={!isPro}
        title={t('dash.page.reviewBtn', { defaultValue: 'Leave a Google review' })}
        hint={review.trim()
          ? t('dash.page.reviewOnHint', { defaultValue: 'Shows on your page and opens your Google review page.' })
          : t('dash.page.reviewHint', { defaultValue: 'Paste your Google review link and the button appears.' })}>
        {isPro ? (
          <>
            <input value={review} disabled={!canEdit} onChange={(e) => setReview(e.target.value)} data-review-input inputMode="url"
              placeholder={t('dash.page.reviewPh', { defaultValue: 'Your Google review link' })} className={input} />
            <p className="text-[11px] text-gray-400 mt-1.5">{t('dash.page.reviewHow', { defaultValue: 'In your Google Business Profile, tap "Ask for reviews" and copy the link.' })}</p>
          </>
        ) : (
          <button type="button" onClick={onUpgrade} data-review-upgrade
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 hover:bg-amber-100">
            <Lock className="w-3 h-3" />{t('dash.prolock.upgradePro', { defaultValue: 'Upgrade to Pro' })}
          </button>
        )}
      </Row>
      <Row icon={Wifi} testId="wifi"
        title={t('dash.page.wifi', { defaultValue: 'Wi-Fi' })}
        hint={t('dash.page.wifiHint2', { defaultValue: 'Guests see your network and copy the password with one tap. Anyone with your page link can see it, so use your guest network.' })}
        right={<Switch on={wifiOn} disabled={!canEdit} onChange={(v) => set(v ? { wifiSsid: draft.wifiSsid ?? '' } : { wifiSsid: null, wifiPassword: null })}
          label={t('dash.page.wifi', { defaultValue: 'Wi-Fi' })} testId="wifi" />}>
        {wifiOn && (
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={draft.wifiSsid ?? ''} disabled={!canEdit} maxLength={32} data-wifi-ssid autoComplete="off"
              onChange={(e) => set({ wifiSsid: e.target.value })}
              placeholder={t('dash.page.wifiNamePh', { defaultValue: 'Network name' })} className={input} />
            <input value={draft.wifiPassword ?? ''} disabled={!canEdit} maxLength={63} data-wifi-password autoComplete="off" spellCheck={false}
              onChange={(e) => set({ wifiPassword: e.target.value || null })}
              placeholder={t('dash.page.wifiPassPh', { defaultValue: 'Password (empty if none)' })} className={`${input} font-mono`} />
          </div>
        )}
      </Row>
      <Row icon={MessageSquareHeart} testId="feedback"
        title={t('dash.page.feedbackBtn', { defaultValue: 'Anonymous feedback' })}
        hint={t('dash.page.feedbackHint2', { defaultValue: 'Guests give stars and a private message. Only you see it, under Feedback.' })}
        right={<Switch on={draft.feedbackOn} disabled={!canEdit} onChange={(v) => set({ feedbackOn: v })} label={t('dash.page.feedbackBtn', { defaultValue: 'Anonymous feedback' })} testId="feedback" />} />
      <Row icon={Gamepad2} testId="game"
        title={t('dash.page.gameBtn', { defaultValue: 'Game' })}
        hint={t('dash.page.gameHint', { defaultValue: 'Stamp Snake, a small game for guests waiting for their order.' })}
        right={<Switch on={draft.gameOn} disabled={!canEdit} onChange={(v) => set({ gameOn: v })} label={t('dash.page.gameBtn', { defaultValue: 'Game' })} testId="game" />} />
    </div>
  );
}
