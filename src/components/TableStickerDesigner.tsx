import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, Loader2, MapPin, Image as ImageIcon, Nfc } from 'lucide-react';
import type { Campaign, Location } from '../types';
import {
  DEFAULT_STICKER, STICKER_NAME_MAX, getMyPageSticker, savePageSticker, pagePhotoUrl,
  type MyBusinessPage, type StickerDesign, type StickerItem, type StickerBg,
} from '../lib/businessPage';
import {
  STICKER_W, STICKER_H, availableStickerItems, stickerItemsShown, stickerItemLabel, stickerItemLook,
  stickerAccent, stickerLogoMode, buildStickerHtml, downloadStickerPng, prefetchStickerFonts,
} from '../services/tableSticker';

const PRESETS = ['#1F5C4A', '#B4472B', '#1E3A8A', '#7C3AED', '#BE185D', '#111827', '#CA8A04'];
const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-opacity-90 transition disabled:opacity-50';
const btnLight = 'inline-flex items-center justify-center gap-1.5 bg-white border notion-border text-[#37352F] px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-[#F7F7F5] transition disabled:opacity-50';
const same = (a: StickerDesign, b: StickerDesign) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The table sticker in Business page > QR code: a live preview (the same HTML
 * that prints), the design choices (saved for the shop) and the downloads.
 * Staff who may not change settings see the preview and the downloads only.
 */
export function TableStickerDesigner({ campaign, page, orderingEnabled, canEdit, locations, urlFor, onDownloaded, onEditLogo }: {
  campaign: Campaign;
  page: MyBusinessPage;
  orderingEnabled: boolean;
  canEdit: boolean;
  /** Active branches; one sticker per branch when there are several. */
  locations: Location[];
  urlFor: (loc: Location | null) => string;
  onDownloaded: () => void;
  onEditLogo: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [design, setDesign] = useState<StickerDesign>(DEFAULT_STICKER);
  const [saved, setSaved] = useState<StickerDesign>(DEFAULT_STICKER);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'de'>(i18n.language?.startsWith('de') ? 'de' : 'en');
  const [locId, setLocId] = useState<string | null>(locations[0]?.id ?? null);
  const [busy, setBusy] = useState<'one' | 'sheet' | null>(null);

  useEffect(() => { prefetchStickerFonts(); }, []);
  useEffect(() => {
    let live = true;
    void getMyPageSticker(campaign.id).then((d) => { if (live) { setDesign(d); setSaved(d); setLoaded(true); } });
    return () => { live = false; };
  }, [campaign.id]);

  const logoUrl = page.avatarPath ? pagePhotoUrl(page.avatarPath) : (campaign.logoImage || null);
  const available = useMemo(() => availableStickerItems({
    orderingOn: orderingEnabled, links: campaign.socialLinks ?? null, wifiSsid: page.extras?.wifiSsid,
    feedbackOn: page.extras?.feedbackOn ?? true, gameOn: page.extras?.gameOn ?? true,
  }), [orderingEnabled, campaign.socialLinks, page.extras]);
  const shown = stickerItemsShown(design.items, available);
  const loc = locations.find((l) => l.id === locId) ?? locations[0] ?? null;
  const input = (l: Location | null) => ({
    url: urlFor(l), design, cardColor: campaign.primaryColor, businessName: campaign.businessName,
    icon: campaign.customIcon, logoUrl, items: shown, lang,
  });
  const html = useMemo(() => buildStickerHtml(input(loc)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, lang, loc?.id, logoUrl, available.join(), campaign.primaryColor, campaign.businessName, campaign.customIcon]);

  // The preview: the real sticker, scaled to the space.
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / STICKER_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const set = (patch: Partial<StickerDesign>) => { setDesign((d) => ({ ...d, ...patch })); setSavedTick(false); setError(null); };
  const toggleItem = (k: StickerItem) => {
    const cur = stickerItemsShown(design.items, available);
    if (cur.includes(k)) { if (cur.length > 1) set({ items: cur.filter((x) => x !== k) }); }
    else if (cur.length < 4) set({ items: [...cur, k] });
  };
  const save = async () => {
    setSaving(true); setError(null);
    const r = await savePageSticker(campaign.id, design);
    setSaving(false);
    if (!r.ok) { setError(t('dash.sticker.saveError', { defaultValue: "Couldn't save your sticker. Try again." })); return; }
    setDesign(r.sticker); setSaved(r.sticker); setSavedTick(true);
  };
  const download = async (kind: 'one' | 'sheet') => {
    setBusy(kind);
    await downloadStickerPng(input(loc), kind, t('dash.sticker.pngError', { defaultValue: "Couldn't make the image. Please try again." }));
    setBusy(null);
    onDownloaded();
  };

  const accent = stickerAccent(design, campaign.primaryColor);
  const mode = stickerLogoMode(design, logoUrl);
  const seg = (on: boolean) => `px-3 py-1.5 rounded-md text-sm font-medium transition ${on ? 'bg-white shadow-sm text-[#37352F]' : 'text-gray-500 hover:text-[#37352F]'}`;
  const label = 'text-xs font-semibold uppercase tracking-wide text-gray-500';

  return (
    <div className="rounded-xl border notion-border p-4 sm:p-5 space-y-5" data-sticker-designer>
      <div>
        <h3 className="font-semibold">{t('dash.sticker.title', { defaultValue: 'Table sticker' })}</h3>
        <p className="text-sm text-gray-500 mt-0.5">{t('dash.sticker.sub', { defaultValue: 'A small sticker for your tables and counter, 12.5 × 5 cm. Guests scan it, or tap it with an NFC tag behind it, to open your page.' })}</p>
      </div>

      {/* Preview */}
      <div className="rounded-xl bg-[#F1EFEC] p-3 sm:p-5">
        <div ref={box} className="relative w-full mx-auto" style={{ maxWidth: STICKER_W, height: STICKER_H * scale }}>
          <iframe title={t('dash.sticker.preview', { defaultValue: 'Sticker preview' })} srcDoc={html} data-sticker-preview
            className="absolute left-0 top-0 border-0 rounded-[22px] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.35)] bg-transparent pointer-events-none"
            style={{ width: STICKER_W, height: STICKER_H, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
        </div>
      </div>

      {/* Language and branch for the preview and the downloads */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex bg-[#F1F1EF] rounded-lg p-1" role="group" aria-label={t('dash.sticker.language', { defaultValue: 'Language' })}>
          {(['en', 'de'] as const).map((l) => (
            <button key={l} type="button" className={seg(lang === l)} onClick={() => setLang(l)} aria-pressed={lang === l} data-sticker-lang={l}>
              {l === 'en' ? 'English' : 'Deutsch'}
            </button>
          ))}
        </div>
        {locations.length > 1 && (
          <label className="inline-flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-gray-400" />
            <select value={loc?.id ?? ''} onChange={(e) => setLocId(e.target.value)} className="border notion-border rounded-lg px-2 py-1.5 bg-white text-sm" data-sticker-location>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {canEdit && loaded && (
        <div className="grid gap-5 md:grid-cols-2" data-sticker-controls>
          {/* Colour */}
          <div className="space-y-2">
            <div className={label}>{t('dash.sticker.colour', { defaultValue: 'Colour' })}</div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => set({ color: null })} data-sticker-color="card"
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${design.color === null ? 'border-[#37352F] ring-2 ring-[#37352F]/10' : 'notion-border'}`}>
                <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: stickerAccent({ ...design, color: null }, campaign.primaryColor) }} />
                {t('dash.sticker.cardColour', { defaultValue: 'My card colour' })}
              </button>
              {PRESETS.map((c) => (
                <button key={c} type="button" onClick={() => set({ color: c })} aria-label={c} data-sticker-color={c}
                  className={`w-7 h-7 rounded-full border-2 ${design.color?.toLowerCase() === c.toLowerCase() ? 'border-[#37352F]' : 'border-white shadow-[0_0_0_1px_rgba(0,0,0,0.1)]'}`} style={{ background: c }} />
              ))}
              <label className="relative w-7 h-7 rounded-full overflow-hidden border border-black/10 cursor-pointer" title={t('dash.sticker.custom', { defaultValue: 'Any colour' })}
                style={{ background: 'conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#6366f1,#d946ef,#ef4444)' }}>
                <input type="color" value={accent} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" data-sticker-color-input />
              </label>
            </div>
          </div>

          {/* Background */}
          <div className="space-y-2">
            <div className={label}>{t('dash.sticker.background', { defaultValue: 'Background' })}</div>
            <div className="inline-flex bg-[#F1F1EF] rounded-lg p-1">
              {([['white', t('dash.sticker.bgWhite', { defaultValue: 'White' })], ['cream', t('dash.sticker.bgCream', { defaultValue: 'Cream' })], ['brand', t('dash.sticker.bgBrand', { defaultValue: 'My colour' })]] as Array<[StickerBg, string]>).map(([k, l]) => (
                <button key={k} type="button" className={seg(design.bg === k)} onClick={() => set({ bg: k })} aria-pressed={design.bg === k} data-sticker-bg={k}>{l}</button>
              ))}
            </div>
          </div>

          {/* Logo and name */}
          <div className="space-y-2">
            <div className={label}>{t('dash.sticker.logo', { defaultValue: 'Logo' })}</div>
            <div className="inline-flex bg-[#F1F1EF] rounded-lg p-1 flex-wrap">
              {([['name', t('dash.sticker.logoName', { defaultValue: 'Name only' })], ['logo_name', t('dash.sticker.logoAndName', { defaultValue: 'Logo and name' })], ['logo', t('dash.sticker.logoOnly', { defaultValue: 'Logo only' })]] as const).map(([k, l]) => (
                <button key={k} type="button" className={seg(mode === k)} disabled={k !== 'name' && !logoUrl} onClick={() => set({ logo: k })} aria-pressed={mode === k} data-sticker-logo={k}>{l}</button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{logoUrl
                ? t('dash.sticker.logoFrom', { defaultValue: 'Uses your profile photo (or card logo).' })
                : t('dash.sticker.noLogo', { defaultValue: 'Add a profile photo to use your logo.' })}</span>
              <button type="button" onClick={onEditLogo} className="font-medium text-[#37352F] underline underline-offset-2" data-sticker-edit-logo>
                {logoUrl ? t('dash.sticker.changeLogo', { defaultValue: 'Change' }) : t('dash.sticker.addLogo', { defaultValue: 'Add one' })}
              </button>
            </div>
            {mode !== 'logo' && (
              <input value={design.name ?? ''} maxLength={STICKER_NAME_MAX} onChange={(e) => set({ name: e.target.value || null })}
                placeholder={campaign.businessName} aria-label={t('dash.sticker.nameLabel', { defaultValue: 'Name on the sticker' })}
                className="w-full border notion-border rounded-lg px-3 py-2 text-sm bg-white" data-sticker-name />
            )}
          </div>

          {/* What's on it */}
          <div className="space-y-2">
            <div className={label}>{t('dash.sticker.items', { defaultValue: 'On the sticker (up to 4)' })}</div>
            <div className="flex flex-wrap gap-1.5">
              {available.map((k) => {
                const on = shown.includes(k);
                const look = stickerItemLook(k);
                const Icon = look.icon;
                return (
                  <button key={k} type="button" onClick={() => toggleItem(k)} aria-pressed={on} data-sticker-item={k}
                    disabled={!on && shown.length >= 4}
                    className={`inline-flex items-center gap-1.5 rounded-full border pl-1 pr-3 py-1 text-xs font-medium transition disabled:opacity-40 ${on ? 'border-[#37352F] bg-white' : 'notion-border bg-white text-gray-500'}`}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${look.tint}1F`, color: look.tint }}><Icon className="w-3.5 h-3.5" /></span>
                    {stickerItemLabel(k, i18n.language?.startsWith('de') ? 'de' : 'en')}
                    {on && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400">{t('dash.sticker.itemsHint', { defaultValue: 'Only what your page offers. Add Wi-Fi, a review link or ordering to see more.' })}</p>
            <label className="flex items-start gap-2 pt-1 text-sm cursor-pointer">
              <input type="checkbox" checked={design.nfc} onChange={(e) => set({ nfc: e.target.checked })} className="mt-0.5 w-4 h-4 accent-[#37352F]" data-sticker-nfc />
              <span><span className="inline-flex items-center gap-1 font-medium"><Nfc className="w-4 h-4" />{t('dash.sticker.nfc', { defaultValue: 'Show the tap (NFC) mark' })}</span>
                <span className="block text-xs text-gray-500">{t('dash.sticker.nfcHint', { defaultValue: 'Leave it on if you put an NFC tag behind the sticker, so guests can tap their phone.' })}</span></span>
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t notion-border">
        {canEdit && loaded && (
          <button type="button" className={btnLight} onClick={() => void save()} disabled={saving || same(design, saved)} data-sticker-save>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedTick && same(design, saved) ? <Check className="w-4 h-4 text-green-600" /> : null}
            {savedTick && same(design, saved) ? t('dash.sticker.saved', { defaultValue: 'Saved' }) : t('dash.sticker.save', { defaultValue: 'Save design' })}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className={btnDark} onClick={() => void download('one')} disabled={busy !== null} data-sticker-download="one">
          {busy === 'one' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{t('dash.sticker.downloadOne', { defaultValue: 'Download sticker' })}
        </button>
        <button type="button" className={btnLight} onClick={() => void download('sheet')} disabled={busy !== null} data-sticker-download="sheet">
          {busy === 'sheet' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{t('dash.sticker.downloadSheet', { defaultValue: 'A4 sheet (5 stickers)' })}
        </button>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <p className="text-xs text-gray-400">{t('dash.sticker.printHint', { defaultValue: 'PNG in print quality. Send the sticker to a print shop, or print the A4 sheet on sticker paper at 100% and cut along the lines.' })}</p>
    </div>
  );
}
