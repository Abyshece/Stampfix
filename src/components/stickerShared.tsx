import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Nfc } from 'lucide-react';
import { DEFAULT_STICKER, STICKER_NAME_MAX, getMyPageSticker, savePageSticker, type StickerDesign, type StickerBg } from '../lib/businessPage';
import { stickerAccent } from '../services/tableSticker';

/**
 * The shop's sticker design, shared by the table sticker and the stamp
 * sticker (Business page > QR code): one design, one Save, so the two
 * stickers always match and a change in either card shows in both.
 */
export interface StickerState {
  design: StickerDesign;
  loaded: boolean;
  saving: boolean;
  /** Just saved, and nothing changed since. */
  savedTick: boolean;
  dirty: boolean;
  error: string | null;
  set: (patch: Partial<StickerDesign>) => void;
  save: () => Promise<void>;
}

const same = (a: StickerDesign, b: StickerDesign) => JSON.stringify(a) === JSON.stringify(b);

export function useStickerDesign(campaignId: string, enabled: boolean): StickerState {
  const { t } = useTranslation();
  const [design, setDesign] = useState<StickerDesign>(DEFAULT_STICKER);
  const [saved, setSaved] = useState<StickerDesign>(DEFAULT_STICKER);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || loaded) return;
    let live = true;
    void getMyPageSticker(campaignId).then((d) => { if (live) { setDesign(d); setSaved(d); setLoaded(true); } });
    return () => { live = false; };
  }, [campaignId, enabled, loaded]);

  return {
    design, loaded, saving, error,
    dirty: !same(design, saved),
    savedTick: savedTick && same(design, saved),
    set: (patch) => { setDesign((d) => ({ ...d, ...patch })); setSavedTick(false); setError(null); },
    save: async () => {
      setSaving(true); setError(null);
      const r = await savePageSticker(campaignId, design);
      setSaving(false);
      if (!r.ok) { setError(t('dash.sticker.saveError', { defaultValue: "Couldn't save your sticker. Try again." })); return; }
      setDesign(r.sticker); setSaved(r.sticker); setSavedTick(true);
    },
  };
}

const PRESETS = ['#1F5C4A', '#B4472B', '#1E3A8A', '#7C3AED', '#BE185D', '#111827', '#CA8A04'];
export const stickerLabel = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
export const stickerSeg = (on: boolean) => `px-3 py-1.5 rounded-md text-sm font-medium transition ${on ? 'bg-white shadow-sm text-[#37352F]' : 'text-gray-500 hover:text-[#37352F]'}`;
const btnLight = 'inline-flex items-center justify-center gap-1.5 bg-white border notion-border text-[#37352F] px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-[#F7F7F5] transition disabled:opacity-50';
/** data-<scope>-<name>, so each card's controls can be told apart. */
const tag = (scope: string, name: string, value: string | boolean = true) => ({ [`data-${scope}-${name}`]: value });

export function StickerColourField({ state, cardColor, scope }: { state: StickerState; cardColor: string | null | undefined; scope: string }) {
  const { t } = useTranslation();
  const { design, set } = state;
  return (
    <div className="space-y-2">
      <div className={stickerLabel}>{t('dash.sticker.colour', { defaultValue: 'Colour' })}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => set({ color: null })} {...tag(scope, 'color', 'card')}
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${design.color === null ? 'border-[#37352F] ring-2 ring-[#37352F]/10' : 'notion-border'}`}>
          <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: stickerAccent({ ...design, color: null }, cardColor) }} />
          {t('dash.sticker.cardColour', { defaultValue: 'My card colour' })}
        </button>
        {PRESETS.map((c) => (
          <button key={c} type="button" onClick={() => set({ color: c })} aria-label={c} {...tag(scope, 'color', c)}
            className={`w-7 h-7 rounded-full border-2 ${design.color?.toLowerCase() === c.toLowerCase() ? 'border-[#37352F]' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.1)]'}`} style={{ background: c }} />
        ))}
        <label className="relative w-7 h-7 rounded-full overflow-hidden border border-black/10 cursor-pointer" title={t('dash.sticker.custom', { defaultValue: 'Any colour' })}
          style={{ background: 'conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)' }}>
          <input type="color" value={stickerAccent(design, cardColor)} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" {...tag(scope, 'color-input')} />
        </label>
      </div>
    </div>
  );
}

export function StickerBgField({ state, scope }: { state: StickerState; scope: string }) {
  const { t } = useTranslation();
  const { design, set } = state;
  return (
    <div className="space-y-2">
      <div className={stickerLabel}>{t('dash.sticker.background', { defaultValue: 'Background' })}</div>
      <div className="inline-flex bg-[#F1F1EF] rounded-lg p-1">
        {([['white', t('dash.sticker.bgWhite', { defaultValue: 'White' })], ['cream', t('dash.sticker.bgCream', { defaultValue: 'Cream' })], ['brand', t('dash.sticker.bgBrand', { defaultValue: 'My colour' })]] as Array<[StickerBg, string]>).map(([k, l]) => (
          <button key={k} type="button" className={stickerSeg(design.bg === k)} onClick={() => set({ bg: k })} aria-pressed={design.bg === k} {...tag(scope, 'bg', k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function StickerNameField({ state, placeholder, scope }: { state: StickerState; placeholder: string; scope: string }) {
  const { t } = useTranslation();
  return (
    <input value={state.design.name ?? ''} maxLength={STICKER_NAME_MAX} onChange={(e) => state.set({ name: e.target.value || null })}
      placeholder={placeholder} aria-label={t('dash.sticker.nameLabel', { defaultValue: 'Name on the sticker' })}
      className="w-full border notion-border rounded-lg px-3 py-2 text-sm bg-white" {...tag(scope, 'name')} />
  );
}

export function StickerNfcField({ state, scope }: { state: StickerState; scope: string }) {
  const { t } = useTranslation();
  return (
    <label className="flex items-start gap-2 pt-1 text-sm cursor-pointer">
      <input type="checkbox" checked={state.design.nfc} onChange={(e) => state.set({ nfc: e.target.checked })} className="mt-0.5 w-4 h-4 accent-[#37352F]" {...tag(scope, 'nfc')} />
      <span><span className="inline-flex items-center gap-1 font-medium"><Nfc className="w-4 h-4" />{t('dash.sticker.nfc', { defaultValue: 'Show the tap (NFC) mark' })}</span>
        <span className="block text-xs text-gray-500">{t('dash.sticker.nfcHint', { defaultValue: 'Leave it on if you put an NFC tag behind the sticker, so guests can tap their phone.' })}</span></span>
    </label>
  );
}

export function StickerSaveButton({ state, scope }: { state: StickerState; scope: string }) {
  const { t } = useTranslation();
  return (
    <button type="button" className={btnLight} onClick={() => void state.save()} disabled={state.saving || !state.dirty} {...tag(scope, 'save')}>
      {state.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : state.savedTick ? <Check className="w-4 h-4 text-green-600" /> : null}
      {state.savedTick ? t('dash.sticker.saved', { defaultValue: 'Saved' }) : t('dash.sticker.save', { defaultValue: 'Save design' })}
    </button>
  );
}
