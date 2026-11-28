import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, MapPin, Copy, Check, ArrowRight, Ticket, X, Navigation, Share2, Info } from 'lucide-react';
import { dealBadge, dateRange, daysLabel, minutesToTime, directionsUrl, distanceLabel, type Deal } from '../lib/deals';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'S';

/** The link that opens this deal on stampfix.app/deals. */
export function dealShareUrl(id: string): string {
  return `${window.location.origin}/deals?deal=${encodeURIComponent(id)}`;
}

/**
 * Everything about one deal, in a window over the deals page: full text,
 * when it is on, where it is (with directions), the code, the fine print,
 * and a link to share it.
 */
export function DealDetails({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('de') ? 'de-DE' : 'en-GB';
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);

  const accent = deal.business.color || '#37352F';
  const badge = dealBadge(deal, t as unknown as (k: string, o: Record<string, unknown>) => string);
  const { from, to } = dateRange(deal.starts_at, deal.ends_at, lang);
  const started = new Date(deal.starts_at).getTime() <= Date.now();
  const hours = deal.start_minute != null && deal.end_minute != null
    ? t('deals.card.hours', { defaultValue: '{{from}} to {{to}}', from: minutesToTime(deal.start_minute), to: minutesToTime(deal.end_minute) })
    : null;
  const days = deal.days.length > 0 ? daysLabel(deal.days, lang) : t('deals.details.everyDay', { defaultValue: 'Every day' });
  const place = deal.place ?? (deal.location ? { name: deal.location.name, address: deal.location.address, lat: null, lng: null } : null);
  const dist = distanceLabel(deal.distance_km, lang);

  const flash = (what: 'code' | 'link') => { setCopied(what); setTimeout(() => setCopied((c) => (c === what ? null : c)), 1800); };
  const copyCode = async () => {
    if (!deal.code) return;
    try { await navigator.clipboard.writeText(deal.code); flash('code'); } catch { /* the code is on screen anyway */ }
  };
  const share = async () => {
    const url = dealShareUrl(deal.id);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try { await nav.share({ title: `${deal.business.name}: ${deal.title}`, url }); return; }
      catch (e) { if ((e as DOMException)?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); flash('link'); } catch { window.prompt(t('deals.details.copyLink', { defaultValue: 'Copy this link' }), url); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" data-deal-details={deal.id}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={deal.title}
        className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto pb-safe">
        <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} aria-hidden />
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-3">
            {deal.business.logo_image
              ? <img src={deal.business.logo_image} alt="" className="w-12 h-12 rounded-xl object-cover border notion-border shrink-0" />
              : <span className="w-12 h-12 rounded-xl flex items-center justify-center font-bold shrink-0" style={{ background: accent, color: deal.business.text_color || '#fff' }} aria-hidden>{initials(deal.business.name)}</span>}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[#37352F] leading-tight break-words">{deal.business.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{deal.city} · {t(`industries.${deal.category}`, { defaultValue: deal.category === 'other' ? 'Other' : deal.category })}</div>
            </div>
            <button ref={closeBtn} type="button" onClick={onClose} aria-label={t('deals.details.close', { defaultValue: 'Close' })} data-deal-details-close
              className="shrink-0 -mr-1 -mt-1 w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-[#F7F7F5]">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {badge && <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${accent}18`, color: accent }}>{badge}</span>}
              {deal.live_now
                ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{t('deals.card.liveNow', { defaultValue: 'On now' })}</span>
                : !started && <span className="text-xs font-semibold text-amber-700">{t('deals.card.soon', { defaultValue: 'Coming soon' })}</span>}
            </div>
            <h2 className="font-serif-display text-2xl font-medium text-[#37352F] leading-snug break-words">{deal.title}</h2>
            {deal.description && <p className="text-[15px] text-gray-600 mt-2 leading-relaxed whitespace-pre-line break-words" data-deal-details-desc>{deal.description}</p>}
          </div>

          <ul className="space-y-2.5 text-sm text-gray-700">
            <li className="flex items-start gap-2.5">
              <CalendarDays className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span>{t('deals.card.dates', { defaultValue: '{{from}} to {{to}}', from, to })}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span>{[days, hours ?? t('deals.details.allDay', { defaultValue: 'All day' })].join(' · ')}</span>
            </li>
            {place && (
              <li className="flex items-start gap-2.5" data-deal-details-place>
                <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">
                  <span className="font-medium text-[#37352F]">{place.name}</span>
                  {place.address && <span className="block text-gray-500">{place.address}</span>}
                  {dist && <span className="block text-gray-500" data-deal-details-distance>{t('deals.details.away', { defaultValue: '{{d}} away', d: dist })}</span>}
                </span>
              </li>
            )}
          </ul>

          {deal.code && (
            <div className="rounded-xl bg-[#F7F7F5] p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{t('deals.details.code', { defaultValue: 'Deal code' })}</div>
              {showCode ? (
                <button type="button" onClick={() => void copyCode()} data-deal-details-code
                  className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed bg-white px-4 py-2 font-mono text-lg font-semibold tracking-wider text-[#37352F]" style={{ borderColor: accent }}>
                  {deal.code}{copied === 'code' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                </button>
              ) : (
                <button type="button" onClick={() => setShowCode(true)} data-deal-details-show-code
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white" style={{ background: accent }}>
                  <Ticket className="w-4 h-4" /> {t('deals.card.showCode', { defaultValue: 'Show code' })}
                </button>
              )}
              {copied === 'code' && <span className="ml-3 text-xs text-green-700" role="status">{t('deals.details.copied', { defaultValue: 'Copied' })}</span>}
            </div>
          )}

          <p className="flex items-start gap-2 text-sm text-gray-600">
            <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <span>{deal.code
              ? t('deals.details.howCode', { defaultValue: 'Show the code at the counter or use it when you book.' })
              : t('deals.details.how', { defaultValue: 'Show this deal at the counter.' })}</span>
          </p>

          {deal.terms && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{t('deals.details.terms', { defaultValue: 'Fine print' })}</div>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line break-words" data-deal-details-terms>{deal.terms}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <a href={directionsUrl(deal)} target="_blank" rel="noopener noreferrer" data-deal-directions
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#37352F] text-white px-4 py-2.5 text-sm font-medium hover:bg-black transition">
              <Navigation className="w-4 h-4" /> {t('deals.details.directions', { defaultValue: 'Directions' })}
            </a>
            <button type="button" onClick={() => void share()} data-deal-share
              className="inline-flex items-center justify-center gap-2 rounded-lg border notion-border bg-white px-4 py-2.5 text-sm font-medium text-[#37352F] hover:border-[#37352F] transition">
              {copied === 'link' ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4" />}
              {copied === 'link' ? t('deals.details.linkCopied', { defaultValue: 'Link copied' }) : t('deals.details.share', { defaultValue: 'Share' })}
            </button>
            <a href={deal.business.link} data-deal-details-visit
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-[#37352F] hover:bg-[#F7F7F5] transition">
              {t('deals.details.visit', { defaultValue: 'Visit {{name}}', name: deal.business.name })} <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
