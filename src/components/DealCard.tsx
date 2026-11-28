import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, MapPin, Copy, Check, ArrowRight, Ticket } from 'lucide-react';
import { dealBadge, dateRange, daysLabel, minutesToTime, type Deal } from '../lib/deals';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'S';

/**
 * One deal, as it looks on stampfix.app/deals. Also used as the live preview
 * in the dashboard form (preview: no links, the code shows straight away).
 */
export function DealCard({ deal, preview = false }: { deal: Deal; preview?: boolean }) {
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

  const copy = async () => {
    if (!deal.code) return;
    try { await navigator.clipboard.writeText(deal.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* shown anyway */ }
  };

  return (
    <article className="relative flex flex-col rounded-2xl border notion-border bg-white overflow-hidden hover:shadow-md transition" data-deal-card={deal.id}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} aria-hidden />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start gap-3">
          {deal.business.logo_image
            ? <img src={deal.business.logo_image} alt="" className="w-10 h-10 rounded-xl object-cover border notion-border shrink-0" loading="lazy" />
            : <span className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0" style={{ background: accent, color: deal.business.text_color || '#fff' }} aria-hidden>{initials(deal.business.name)}</span>}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[#37352F] leading-tight truncate">{deal.business.name}</div>
            <div className="text-xs text-gray-500 truncate">{deal.city} · {t(`industries.${deal.category}`, { defaultValue: deal.category === 'other' ? 'Other' : deal.category })}</div>
          </div>
          {badge && (
            <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap" style={{ background: `${accent}18`, color: accent }} data-deal-badge>{badge}</span>
          )}
        </div>

        <div>
          <h3 className="font-serif-display text-xl font-medium text-[#37352F] leading-snug break-words">{deal.title}</h3>
          {deal.description && <p className="text-sm text-gray-600 mt-1 leading-relaxed line-clamp-3 break-words">{deal.description}</p>}
        </div>

        <ul className="space-y-1.5 text-[13px] text-gray-600">
          <li className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
            <span>{t('deals.card.dates', { defaultValue: '{{from}} to {{to}}', from, to })}</span>
            {deal.live_now
              ? <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{t('deals.card.liveNow', { defaultValue: 'On now' })}</span>
              : !started && <span className="ml-auto text-[11px] font-semibold text-amber-700">{t('deals.card.soon', { defaultValue: 'Coming soon' })}</span>}
          </li>
          {(days || hours) && (
            <li className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400 shrink-0" /><span>{[days, hours].filter(Boolean).join(' · ')}</span></li>
          )}
          {deal.location && (
            <li className="flex items-start gap-2"><MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" /><span className="min-w-0 break-words">{deal.location.address || deal.location.name}</span></li>
          )}
        </ul>

        {deal.terms && <p className="text-[11px] text-gray-400 leading-snug break-words">{deal.terms}</p>}

        <div className="mt-auto pt-1 flex items-center gap-2 flex-wrap">
          {deal.code && (showCode ? (
            <button type="button" onClick={() => void copy()} disabled={preview}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-dashed px-3 py-1.5 font-mono text-sm font-semibold tracking-wider text-[#37352F]"
              style={{ borderColor: accent }} data-deal-code>
              {deal.code}{!preview && (copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />)}
            </button>
          ) : (
            <button type="button" onClick={() => setShowCode(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ background: accent }} data-deal-show-code>
              <Ticket className="w-4 h-4" /> {t('deals.card.showCode', { defaultValue: 'Show code' })}
            </button>
          ))}
          {!preview && (
            <a href={deal.business.link} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[#37352F] hover:underline" data-deal-link>
              {t('deals.card.visit', { defaultValue: 'Visit' })} <ArrowRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
