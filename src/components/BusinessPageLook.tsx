import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Palette, Star, Wifi, MessageSquareHeart, Gamepad2, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Campaign } from '../types';
import {
  savePageLook, savePageExtras, PAGE_BACKGROUNDS,
  type MyBusinessPage, type PageLook, type PageExtras, type PageBackground, type SaveLookError, type SaveExtrasError,
} from '../lib/businessPage';
import { pageAccent, pageTheme } from './BusinessPage';
import { ProLockOverlay } from './ProLockOverlay';

// Two cards on the Business page's Profile tab:
//   Look (Pro): button colour, background and heading style.
//   On your page (every plan): Google review button, Wi-Fi, feedback, game.

const card = 'bg-white rounded-xl border notion-border p-5 sm:p-6';
const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-3.5 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 transition disabled:opacity-50';
const btnLight = 'inline-flex items-center justify-center gap-1.5 bg-white border notion-border text-[#37352F] px-3.5 py-2 rounded-md text-sm font-medium hover:bg-[#F7F7F5] transition disabled:opacity-50';

const PRESETS = ['#2F2A26', '#1F5C4A', '#0F766E', '#2563EB', '#7C3AED', '#DB2777', '#B91C1C', '#C2410C', '#CA8A04'];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const BG_LABEL: Record<PageBackground, [string, string]> = {
  cream: ['dash.page.bgCream', 'Cream'], white: ['dash.page.bgWhite', 'White'], stone: ['dash.page.bgStone', 'Stone'], dark: ['dash.page.bgDark', 'Dark'],
};

const LOOK_ERRORS: Record<SaveLookError, [string, string]> = {
  pro_only: ['dash.page.lookErrPro', 'Your own colours are a Pro feature.'],
  bad_colour: ['dash.page.lookErrColour', 'Use a colour like #1F5C4A.'],
  bad_background: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
  bad_heading: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
  no_page: ['dash.page.errNoPage', "Your page isn't ready yet. Reload and try again."],
  network: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
};

export function sameLook(a: PageLook, b: PageLook): boolean {
  return (a.accentColor ?? '').toUpperCase() === (b.accentColor ?? '').toUpperCase() && a.background === b.background && a.headingStyle === b.headingStyle;
}

export function LookCard({ campaign, page, draft, setDraft, isPro, canEdit, onUpgrade, onPageSaved }: {
  campaign: Campaign; page: MyBusinessPage & { look: PageLook }; draft: PageLook; setDraft: (l: PageLook) => void;
  isPro: boolean; canEdit: boolean; onUpgrade: () => void; onPageSaved: (p: MyBusinessPage) => void;
}) {
  const { t } = useTranslation();
  const [hexDraft, setHexDraft] = useState(draft.accentColor ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameLook(draft, page.look);
  const disabled = !canEdit || !isPro;

  const set = (patch: Partial<PageLook>) => { setDraft({ ...draft, ...patch }); setError(null); setSaved(false); };
  const pick = (hex: string | null) => { set({ accentColor: hex }); setHexDraft(hex ?? ''); };

  // Would the page fall back to its own button colour?
  const wanted = draft.accentColor ?? campaign.primaryColor ?? null;
  const dark = pageTheme(draft.background).dark;
  const shown = pageAccent(wanted, dark);
  const fallback = !!wanted && shown.bg.toUpperCase() !== (wanted.startsWith('#') ? wanted : `#${wanted}`).toUpperCase();

  const save = async () => {
    setSaving(true); setError(null);
    const r = await savePageLook(campaign.id, draft);
    setSaving(false);
    if (!r.ok) { const [k, d] = LOOK_ERRORS[r.error]; setError(t(k, { defaultValue: d })); return; }
    onPageSaved({ ...page, look: r.look });
    setDraft(r.look);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const swatch = (hex: string | null, label: string, key: string) => {
    const active = (draft.accentColor ?? null)?.toUpperCase() === hex?.toUpperCase() || (hex === null && draft.accentColor === null);
    const color = hex ?? campaign.primaryColor ?? '#2F2A26';
    return (
      <button key={key} type="button" disabled={disabled} onClick={() => pick(hex)} aria-label={label} title={label} aria-pressed={active} data-accent={hex ?? 'card'}
        className={`relative w-9 h-9 rounded-full border-2 transition ${active ? 'border-[#37352F] scale-110' : 'border-white shadow-[0_0_0_1px_#E9E9E7]'}`}
        style={{ background: color }}>
        {active && <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow-[0_0_1.5px_rgba(0,0,0,0.9)]" />}
      </button>
    );
  };

  return (
    <section className={`${card} space-y-5`} data-look-card>
      <div className="flex items-center gap-2"><Palette className="w-5 h-5" /><h3 className="font-semibold">{t('dash.page.lookTitle', { defaultValue: 'Look' })}</h3></div>
      <ProLockOverlay locked={!isPro} title={t('dash.page.lookPro', { defaultValue: 'Your own colours are a Pro feature' })} onUpgrade={onUpgrade}>
        <div className="space-y-5">
          <div>
            <div className="text-sm font-medium mb-2">{t('dash.page.buttonColour', { defaultValue: 'Button colour' })}</div>
            <div className="flex flex-wrap items-center gap-2.5">
              {swatch(null, t('dash.page.cardColour', { defaultValue: 'Same as my card' }), 'card')}
              <span className="w-px h-7 bg-[#E9E9E7] mx-0.5" aria-hidden="true" />
              {PRESETS.map((h) => swatch(h, h, h))}
              <label className="inline-flex items-center gap-2 ml-1">
                <input type="color" disabled={disabled} value={HEX_RE.test(hexDraft) ? hexDraft : (wanted && HEX_RE.test(wanted) ? wanted : '#2F2A26')}
                  onChange={(e) => pick(e.target.value.toUpperCase())} aria-label={t('dash.page.pickColour', { defaultValue: 'Pick a colour' })}
                  className="w-9 h-9 rounded-full border notion-border cursor-pointer bg-white p-0.5" />
                <input value={hexDraft} disabled={disabled} maxLength={7} placeholder="#1F5C4A" data-accent-hex
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setHexDraft(v);
                    const full = v.startsWith('#') ? v : `#${v}`;
                    if (HEX_RE.test(full)) set({ accentColor: full.toUpperCase() });
                  }}
                  className="w-24 border notion-border rounded-md px-2 py-1.5 text-sm font-mono uppercase disabled:bg-white" />
              </label>
            </div>
            {draft.accentColor === null && <p className="text-xs text-gray-500 mt-2">{t('dash.page.cardColourHint', { defaultValue: 'Uses the colour of your stamp card.' })}</p>}
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
            <div className="text-sm font-medium mb-2">{t('dash.page.background', { defaultValue: 'Background' })}</div>
            <div className="grid grid-cols-4 gap-2 max-w-md">
              {PAGE_BACKGROUNDS.map((bg) => {
                const th = pageTheme(bg);
                const active = draft.background === bg;
                return (
                  <button key={bg} type="button" disabled={disabled} onClick={() => set({ background: bg })} aria-pressed={active} data-bg={bg}
                    className={`rounded-lg border-2 p-1.5 text-xs font-medium transition ${active ? 'border-[#37352F]' : 'border-transparent hover:border-[#E9E9E7]'}`}>
                    <span className="block h-10 rounded-md border notion-border relative overflow-hidden" style={{ background: th.bg }}>
                      <span className="absolute left-2 right-2 bottom-1.5 h-3 rounded" style={{ background: th.card, border: `1px solid ${th.border}` }} />
                    </span>
                    <span className="block mt-1">{t(BG_LABEL[bg][0], { defaultValue: BG_LABEL[bg][1] })}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">{t('dash.page.headings', { defaultValue: 'Headings' })}</div>
            <div className="flex gap-2">
              {(['serif', 'sans'] as const).map((h) => (
                <button key={h} type="button" disabled={disabled} onClick={() => set({ headingStyle: h })} aria-pressed={draft.headingStyle === h} data-heading={h}
                  className={`rounded-lg border-2 px-4 py-2 transition ${draft.headingStyle === h ? 'border-[#37352F]' : 'border-[#E9E9E7] hover:border-gray-300'}`}>
                  <span className={`block text-xl leading-none ${h === 'serif' ? 'font-serif-display font-semibold' : 'font-bold tracking-tight'}`}>Aa</span>
                  <span className="block text-xs text-gray-500 mt-1">{h === 'serif' ? t('dash.page.headClassic', { defaultValue: 'Classic' }) : t('dash.page.headModern', { defaultValue: 'Modern' })}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </ProLockOverlay>
      {error && <p className="text-sm text-red-600" data-look-error>{error}</p>}
      {canEdit && isPro && (
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-green-700 inline-flex items-center gap-1" data-look-saved><Check className="w-4 h-4" />{t('dash.page.saved', { defaultValue: 'Saved' })}</span>}
          {dirty && <button type="button" className={btnLight} onClick={() => { setDraft(page.look); setHexDraft(page.look.accentColor ?? ''); }}>{t('dash.page.undo', { defaultValue: 'Undo' })}</button>}
          <button type="button" className={btnDark} disabled={saving || !dirty} onClick={() => void save()} data-look-save>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.page.save', { defaultValue: 'Save' })}
          </button>
        </div>
      )}
    </section>
  );
}

const EXTRA_ERRORS: Record<SaveExtrasError, [string, string]> = {
  bad_ssid: ['dash.page.wifiErrName', 'Network names are up to 32 characters.'],
  bad_password: ['dash.page.wifiErrPass', 'Wi-Fi passwords are up to 63 characters.'],
  no_page: ['dash.page.errNoPage', "Your page isn't ready yet. Reload and try again."],
  network: ['dash.page.errNetwork', "Couldn't save. Check your connection and try again."],
};

export function sameExtras(a: PageExtras, b: PageExtras): boolean {
  return (a.wifiSsid ?? '') === (b.wifiSsid ?? '') && (a.wifiPassword ?? '') === (b.wifiPassword ?? '')
    && a.feedbackOn === b.feedbackOn && a.gameOn === b.gameOn;
}

function Switch({ on, onChange, disabled, label, testId }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; testId: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} data-switch={testId}
      className={`relative w-11 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${on ? 'bg-green-600' : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}

export function ExtrasCard({ campaign, page, draft, setDraft, canEdit, hasReviewLink, onOpenLinks, onPageSaved }: {
  campaign: Campaign; page: MyBusinessPage & { extras: PageExtras }; draft: PageExtras; setDraft: (x: PageExtras) => void;
  canEdit: boolean; hasReviewLink: boolean; onOpenLinks: () => void; onPageSaved: (p: MyBusinessPage) => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = !sameExtras(draft, page.extras);
  const set = (patch: Partial<PageExtras>) => { setDraft({ ...draft, ...patch }); setError(null); setSaved(false); };

  const save = async () => {
    setSaving(true); setError(null);
    const r = await savePageExtras(campaign.id, { ...draft, wifiSsid: draft.wifiSsid?.trim() || null });
    setSaving(false);
    if (!r.ok) { const [k, d] = EXTRA_ERRORS[r.error]; setError(t(k, { defaultValue: d })); return; }
    onPageSaved({ ...page, extras: r.extras });
    setDraft(r.extras);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  };

  const row = 'flex items-start gap-3 py-4 border-t notion-border first:border-t-0 first:pt-0';
  return (
    <section className={card} data-extras-card>
      <h3 className="font-semibold">{t('dash.page.extrasTitle', { defaultValue: 'Buttons on your page' })}</h3>
      <p className="text-sm text-gray-500 mt-1 mb-4">{t('dash.page.extrasSub', { defaultValue: 'Big buttons under your stamp card. Each one shows only when it is set up or switched on.' })}</p>
      <div>
        <div className={row} data-extra="review">
          <Star className="w-5 h-5 mt-0.5 shrink-0 text-gray-500" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t('dash.page.reviewBtn', { defaultValue: 'Leave a Google review' })}</div>
            <p className="text-xs text-gray-500 mt-0.5">{hasReviewLink
              ? t('dash.page.reviewOn', { defaultValue: 'On. It opens the Google review link from your Links.' })
              : t('dash.page.reviewOff', { defaultValue: 'Add your Google review link in Links and this button appears.' })}</p>
          </div>
          <button type="button" className={`${btnLight} shrink-0 !px-2.5 !py-1.5 text-xs`} onClick={onOpenLinks} data-review-links>
            {hasReviewLink ? t('dash.page.edit', { defaultValue: 'Edit' }) : t('dash.page.addLink', { defaultValue: 'Add link' })}<ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className={row} data-extra="wifi">
          <Wifi className="w-5 h-5 mt-0.5 shrink-0 text-gray-500" />
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <div className="text-sm font-medium">{t('dash.page.wifi', { defaultValue: 'Wi-Fi' })}</div>
              <p className="text-xs text-gray-500 mt-0.5">{t('dash.page.wifiHint', { defaultValue: 'Guests see the network and can copy the password. Anyone who opens your page can see it, so use your guest network. Leave the name empty to hide the button.' })}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input value={draft.wifiSsid ?? ''} disabled={!canEdit} maxLength={32} data-wifi-ssid
                onChange={(e) => set({ wifiSsid: e.target.value || null })}
                placeholder={t('dash.page.wifiNamePh', { defaultValue: 'Network name' })}
                className="w-full border notion-border rounded-md px-3 py-2 text-sm disabled:bg-white disabled:text-gray-500" />
              <input value={draft.wifiPassword ?? ''} disabled={!canEdit || !draft.wifiSsid} maxLength={63} data-wifi-password autoComplete="off" spellCheck={false}
                onChange={(e) => set({ wifiPassword: e.target.value || null })}
                placeholder={t('dash.page.wifiPassPh', { defaultValue: 'Password (empty if none)' })}
                className="w-full border notion-border rounded-md px-3 py-2 text-sm font-mono disabled:bg-[#F7F7F5] disabled:text-gray-400" />
            </div>
          </div>
        </div>
        <div className={row} data-extra="feedback">
          <MessageSquareHeart className="w-5 h-5 mt-0.5 shrink-0 text-gray-500" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t('dash.page.feedbackBtn', { defaultValue: 'Anonymous feedback' })}</div>
            <p className="text-xs text-gray-500 mt-0.5">{t('dash.page.feedbackHint', { defaultValue: 'Guests give stars and a private message. Only you see it, in the Feedback tab.' })}</p>
          </div>
          <Switch on={draft.feedbackOn} disabled={!canEdit} onChange={(v) => set({ feedbackOn: v })} label={t('dash.page.feedbackBtn', { defaultValue: 'Anonymous feedback' })} testId="feedback" />
        </div>
        <div className={row} data-extra="game">
          <Gamepad2 className="w-5 h-5 mt-0.5 shrink-0 text-gray-500" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t('dash.page.gameBtn', { defaultValue: 'Game' })}</div>
            <p className="text-xs text-gray-500 mt-0.5">{t('dash.page.gameHint', { defaultValue: 'Stamp Snake, a small game for guests waiting for their order.' })}</p>
          </div>
          <Switch on={draft.gameOn} disabled={!canEdit} onChange={(v) => set({ gameOn: v })} label={t('dash.page.gameBtn', { defaultValue: 'Game' })} testId="game" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mt-2" data-extras-error>{error}</p>}
      {canEdit && (
        <div className="flex items-center justify-end gap-3 mt-2">
          {saved && <span className="text-sm text-green-700 inline-flex items-center gap-1" data-extras-saved><Check className="w-4 h-4" />{t('dash.page.saved', { defaultValue: 'Saved' })}</span>}
          <button type="button" className={btnDark} disabled={saving || !dirty} onClick={() => void save()} data-extras-save>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('dash.page.save', { defaultValue: 'Save' })}
          </button>
        </div>
      )}
    </section>
  );
}
