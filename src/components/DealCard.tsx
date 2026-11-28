import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, MapPin, Copy, Check, ArrowRight, Ticket, Navigation } from 'lucide-react';
import { dealBadge, dateRange, daysLabel, minutesToTime, distanceLabel, type Deal } from '../lib/deals';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'S';

/**
 * One deal, as it looks on stampfix.app/deals: a ticket, with the offer on a
 * soft wash of the shop's colour, a tear line, and the details below. Also
 * used as the live preview in the dashboard form (preview: no links, the code
 * shows straight away), and for the examples on an empty deals page (sample:
 * labelled, no links). onOpen (deals page only) opens the full details.
 */
export function DealCard({ deal, preview = false, sample = false, onOpen, notch = '#FFFFFF' }: {
  deal: Deal; preview?: boolean; sample?: boolean; onOpen?: () => void;
  /** The colour behind the card, for the two cut-outs at the tear line. */
  notch?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('de') ? 'de-DE' : 'en-GB';
  const [showCode, setShowCode] = useState(preview);
  const [copied, setCopied] = useState(false);
  const accent = deal.business.color || '#37352F';
  const badge = dealBadge(deal, t as unknown as (k: string, o: Record<string, unknown>) => string);
  const { from, to } = dateRange(deal.starts_at, deal.ends_at, lang);
  const started = new Date(deal.starts_at).getTime() <= Date.now();
  const hours = deal.start_minute != null && deal.end_minute != null
    ? t('deals.card.hours', { defaultValue: '{{from}} to {{to}}', from: minutesToTime(deal.start_minute), to: minutesToTime(deal.end_minute) })
    : null;
  const days = deal.days.length > 0 ? daysLabel(deal.days, lang) : null;
  const place = deal.place ?? (deal.location ? { name: deal.location.name, address: deal.location.address } : null);
  const where = deal.location ? (deal.location.address || deal.location.name) : place ? (place.address || place.name) : null;
  const dist = distanceLabel(deal.distance_km, lang);

  const copy = async () => {
    if (!deal.code) return;
    try { await navigator.clipboard.writeText(deal.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* shown anyway */ }
  };
  const chip = 'inline-flex items-center gap-1.5 max-w-full rounded-full bg-[#F4F3F1] px-2.5 py-1 text-[12px] text-gray-600';

  return (
    <article className="group relative flex flex-col rounded-3xl border border-black/[0.06] bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.28)]"
      data-deal-card={deal.id}>
      {/* The offer, on a soft wash of the shop's colour. */}
      <div className="relative px-5 pt-5 pb-5" style={{ background: `linear-gradient(140deg, ${accent}1F 0%, ${accent}0A 55%, transparent 100%)` }}>
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 w-40 h-40 rounded-full blur-2xl opacity-60" style={{ background: `${accent}26` }} />
        <div className="relative flex items-center gap-3">
          {deal.business.logo_image
            ? <img src={deal.business.logo_image} alt="" className="w-11 h-11 rounded-2xl object-cover bg-white shadow-sm shrink-0" loading="lazy" />
            : <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 shadow-sm" style={{ background: accent, color: deal.business.text_color || '#fff' }} aria-hidden>{initials(deal.business.name)}</span>}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[15px] text-[#2B2A27] leading-tight truncate">{deal.business.name}</div>
            <div className="text-xs text-gray-500 truncate mt-0.5">{deal.city} · {t(`industries.${deal.category}`, { defaultValue: deal.category === 'other' ? 'Other' : deal.category })}</div>
          </div>
          {deal.live_now
            ? <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-green-700 shadow-sm"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{t('deals.card.liveNow', { defaultValue: 'On now' })}</span>
            : !started && <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-amber-700 shadow-sm">{t('deals.card.soon', { defaultValue: 'Coming soon' })}</span>}
        </div>

        <div className="relative mt-5 flex items-end justify-between gap-3">
          {badge
            ? <span className="text-[28px] font-extrabold tracking-tight leading-none" style={{ color: accent }} data-deal-badge>{badge}</span>
            : <span />}
          {sample && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-white/80 rounded-full px-2 py-0.5" data-deal-example>{t('deals.card.example', { defaultValue: 'Example' })}</span>}
        </div>
        <h3 className="relative mt-2 text-[17px] font-semibold text-[#2B2A27] leading-snug break-words">
          {onOpen ? <button type="button" onClick={onOpen} className="text-left hover:underline decoration-1 underline-offset-4" data-deal-open>{deal.title}</button> : deal.title}
        </h3>
      </div>

      {/* Tear line, like a ticket. */}
      <div className="relative h-0" aria-hidden>
        <span className="absolute inset-x-5 top-0 border-t-2 border-dashed border-black/[0.08]" />
        <span className="absolute left-0 top-0 w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/[0.06]" style={{ background: notch }} />
        <span className="absolute right-0 top-0 w-5 h-5 translate-x-1/2 -translate-y-1/2 rounded-full border border-black/[0.06]" style={{ background: notch }} />
      </div>

      <div className="flex flex-col flex-1 gap-3 px-5 pt-4 pb-5">
        {deal.description && <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 break-words">{deal.description}</p>}

        <div className="flex flex-wrap gap-1.5">
          <span className={chip}><CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />{t('deals.card.dates', { defaultValue: '{{from}} to {{to}}', from, to })}</span>
          {(days || hours) && <span className={chip}><Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="truncate">{[days, hours].filter(Boolean).join(' · ')}</span></span>}
          {where && <span className={chip} data-deal-where><MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="truncate">{where}</span></span>}
          {dist && <span className={`${chip} !bg-[#2B2A27] !text-white font-semibold`} data-deal-distance><Navigation className="w-3 h-3 shrink-0" />{dist}</span>}
        </div>

        {deal.terms && <p className="text-[11px] text-gray-400 leading-snug line-clamp-2 break-words">{deal.terms}</p>}

        <div className="mt-auto pt-1 flex items-center gap-2 flex-wrap">
          {deal.code && (showCode ? (
            <button type="button" onClick={() => void copy()} disabled={preview}
              className="inline-flex items-center gap-2 rounded-full border-2 border-dashed bg-white px-3.5 py-1.5 font-mono text-sm font-semibold tracking-wider text-[#2B2A27]"
              style={{ borderColor: accent }} data-deal-code>
              {deal.code}{!preview && (copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />)}
            </button>
          ) : (
            <button type="button" onClick={() => setShowCode(true)}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90" style={{ background: accent }} data-deal-show-code>
              <Ticket className="w-4 h-4" /> {t('deals.card.showCode', { defaultValue: 'Show code' })}
            </button>
          ))}
          {!preview && !sample && (onOpen ? (
            <button type="button" onClick={onOpen} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-[#2B2A27] hover:bg-[#F4F3F1] transition" data-deal-details-btn>
              {t('deals.card.details', { defaultValue: 'Details' })} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : (
            <a href={deal.business.link} className="ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-[#2B2A27] hover:bg-[#F4F3F1] transition" data-deal-link>
              {t('deals.card.visit', { defaultValue: 'Visit' })} <ArrowRight className="w-3.5 h-3.5" />
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}
