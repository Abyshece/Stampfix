import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, MapPin, Stamp } from 'lucide-react';
import type { Campaign, Location } from '../types';
import { DEFAULT_STICKER, getMyPageSticker, type StickerDesign } from '../lib/businessPage';
import { STICKER_W, STICKER_H, buildStampStickerHtml, downloadStampStickerPng, prefetchStickerFonts } from '../services/tableSticker';

const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-opacity-90 transition disabled:opacity-50';
const btnLight = 'inline-flex items-center justify-center gap-1.5 bg-white border notion-border text-[#37352F] px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-[#F7F7F5] transition disabled:opacity-50';

/**
 * The self-serve stamp sticker (Business page > QR code, self-serve shops):
 * the counter stamp QR code with "Scan or tap to get your stamp", in the same
 * small sticker format and colours as the table sticker. One per branch.
 */
export function StampStickerCard({ campaign, locations, stampUrlFor }: {
  campaign: Campaign;
  /** Active branches; with several, the owner picks which one. */
  locations: Location[];
  stampUrlFor: (loc: Location | null) => string;
}) {
  const { t, i18n } = useTranslation();
  const [design, setDesign] = useState<StickerDesign>(DEFAULT_STICKER);
  const [lang, setLang] = useState<'en' | 'de'>(i18n.language?.startsWith('de') ? 'de' : 'en');
  const [locId, setLocId] = useState<string | null>(locations[0]?.id ?? null);
  const [busy, setBusy] = useState<'one' | 'sheet' | null>(null);

  useEffect(() => { prefetchStickerFonts(); }, []);
  useEffect(() => {
    let live = true;
    void getMyPageSticker(campaign.id).then((d) => { if (live) setDesign(d); });
    return () => { live = false; };
  }, [campaign.id]);

  const loc = locations.find((l) => l.id === locId) ?? locations[0] ?? null;
  const input = { url: stampUrlFor(loc), design, cardColor: campaign.primaryColor, businessName: campaign.businessName, lang };
  const html = useMemo(() => buildStampStickerHtml(input),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design, lang, loc?.id, campaign.primaryColor, campaign.businessName]);

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

  const download = async (kind: 'one' | 'sheet') => {
    setBusy(kind);
    await downloadStampStickerPng(input, kind, t('dash.sticker.pngError', { defaultValue: "Couldn't make the image. Please try again." }));
    setBusy(null);
  };
  const seg = (on: boolean) => `px-3 py-1.5 rounded-md text-sm font-medium transition ${on ? 'bg-white shadow-sm text-[#37352F]' : 'text-gray-500 hover:text-[#37352F]'}`;

  return (
    <div className="rounded-xl border notion-border p-4 sm:p-5 space-y-4" data-stamp-sticker>
      <div className="flex items-start gap-2">
        <Stamp className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold">{t('dash.stampSticker.title', { defaultValue: 'Stamp sticker' })}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{t('dash.stampSticker.sub', { defaultValue: 'For self-serve stamping. Put it at the till: paying guests scan it, or tap it with an NFC tag behind it, and get their stamp. Same size and colours as your table sticker.' })}</p>
        </div>
      </div>

      <div className="rounded-xl bg-[#F1EFEC] p-3 sm:p-5">
        <div ref={box} className="relative w-full mx-auto" style={{ maxWidth: STICKER_W, height: STICKER_H * scale }}>
          <iframe title={t('dash.stampSticker.preview', { defaultValue: 'Stamp sticker preview' })} srcDoc={html} data-stamp-sticker-preview
            className="absolute left-0 top-0 border-0 rounded-[22px] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.35)] bg-transparent pointer-events-none"
            style={{ width: STICKER_W, height: STICKER_H, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex bg-[#F1F1EF] rounded-lg p-1" role="group" aria-label={t('dash.sticker.language', { defaultValue: 'Language' })}>
          {(['en', 'de'] as const).map((l) => (
            <button key={l} type="button" className={seg(lang === l)} onClick={() => setLang(l)} aria-pressed={lang === l} data-stamp-sticker-lang={l}>
              {l === 'en' ? 'English' : 'Deutsch'}
            </button>
          ))}
        </div>
        {locations.length > 1 && (
          <label className="inline-flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-gray-400" />
            <select value={loc?.id ?? ''} onChange={(e) => setLocId(e.target.value)} className="border notion-border rounded-lg px-2 py-1.5 bg-white text-sm" data-stamp-sticker-location>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <span className="flex-1" />
        <button type="button" className={btnDark} onClick={() => void download('one')} disabled={busy !== null} data-stamp-sticker-download="one">
          {busy === 'one' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{t('dash.sticker.downloadOne', { defaultValue: 'Download sticker' })}
        </button>
        <button type="button" className={btnLight} onClick={() => void download('sheet')} disabled={busy !== null} data-stamp-sticker-download="sheet">
          {busy === 'sheet' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{t('dash.sticker.downloadSheet', { defaultValue: 'A4 sheet (5 stickers)' })}
        </button>
      </div>
    </div>
  );
}
