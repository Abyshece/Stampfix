import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { DEAL_CATEGORIES, type DealCategory } from '../../lib/deals';

// "Browse by business type" on stampfix.app/deals: one tile per business type,
// each with a soft coloured glow shining from behind it. Tapping a tile filters
// the deals to that type; tapping it again shows all of them.

const LOOK: Record<DealCategory, { emoji: string; a: string; b: string }> = {
  cafe: { emoji: '☕', a: '#F59E0B', b: '#EA580C' },
  restaurant: { emoji: '🍽️', a: '#F43F5E', b: '#F97316' },
  bakery: { emoji: '🥐', a: '#FBBF24', b: '#D97706' },
  iceCream: { emoji: '🍦', a: '#F472B6', b: '#38BDF8' },
  snackBar: { emoji: '🌭', a: '#FB923C', b: '#EF4444' },
  pizzeria: { emoji: '🍕', a: '#EF4444', b: '#F59E0B' },
  bar: { emoji: '🍸', a: '#8B5CF6', b: '#D946EF' },
  florist: { emoji: '💐', a: '#EC4899', b: '#F43F5E' },
  nailStudio: { emoji: '💅', a: '#D946EF', b: '#EC4899' },
  hairdresser: { emoji: '💇', a: '#A855F7', b: '#EC4899' },
  barbershop: { emoji: '💈', a: '#3B82F6', b: '#EF4444' },
  tattoo: { emoji: '🖋️', a: '#475569', b: '#8B5CF6' },
  gym: { emoji: '🏋️', a: '#84CC16', b: '#10B981' },
  retail: { emoji: '🛍️', a: '#0EA5E9', b: '#6366F1' },
  doner: { emoji: '🥙', a: '#F97316', b: '#EAB308' },
  bubbleTea: { emoji: '🧋', a: '#14B8A6', b: '#F472B6' },
  foodTruck: { emoji: '🚚', a: '#F59E0B', b: '#EF4444' },
  lashBrow: { emoji: '👁️', a: '#F43F5E', b: '#A855F7' },
  spa: { emoji: '🧖', a: '#14B8A6', b: '#06B6D4' },
  carWash: { emoji: '🚗', a: '#0EA5E9', b: '#2563EB' },
  dogGrooming: { emoji: '🐕', a: '#F59E0B', b: '#84CC16' },
  dryCleaner: { emoji: '👔', a: '#06B6D4', b: '#6366F1' },
  yoga: { emoji: '🧘', a: '#10B981', b: '#14B8A6' },
  other: { emoji: '✨', a: '#94A3B8', b: '#6366F1' },
};

/** The order before any deals exist: the business types most guests look for. */
const POPULAR: DealCategory[] = [
  'cafe', 'restaurant', 'bakery', 'hairdresser', 'nailStudio', 'gym', 'barbershop', 'pizzeria', 'bar', 'iceCream', 'spa', 'retail',
  'bubbleTea', 'doner', 'florist', 'lashBrow', 'carWash', 'yoga', 'tattoo', 'snackBar', 'foodTruck', 'dogGrooming', 'dryCleaner', 'other',
];
const FIRST = 12;
/** Phones show fewer to start, so the deals are not far down. */
const FIRST_PHONE = 6;

export function DealCategoryTiles({ counts, active, onPick }: {
  counts: Map<string, number>;
  active: string;
  onPick: (key: DealCategory | '') => void;
}) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  // Types with deals first (most deals first), then the popular order.
  const order = useMemo(() => {
    const known = new Set<string>(DEAL_CATEGORIES);
    const base = POPULAR.filter((k) => known.has(k));
    return [...base].sort((x, y) => (counts.get(y) ?? 0) - (counts.get(x) ?? 0) || base.indexOf(x) - base.indexOf(y));
  }, [counts]);
  const activeIdx = order.indexOf(active as DealCategory);
  const shown = all || activeIdx >= FIRST ? order : order.slice(0, FIRST);

  return (
    <section className="max-w-6xl mx-auto px-6 pb-10" data-deal-tiles aria-labelledby="deal-tiles-title">
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h2 id="deal-tiles-title" className="text-xl md:text-2xl font-serif-display font-medium text-[#37352F]">{t('deals.page.browseTitle', { defaultValue: 'Browse by business type' })}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('deals.page.browseSub', { defaultValue: 'Pick a type to see its deals.' })}</p>
        </div>
        {active && (
          <button type="button" onClick={() => onPick('')} className="shrink-0 text-sm text-gray-500 hover:text-[#37352F] underline-offset-4 hover:underline" data-deal-tiles-clear>
            {t('deals.page.allTypes', { defaultValue: 'All businesses' })}
          </button>
        )}
      </div>
      <ul className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {shown.map((key, i) => {
          const look = LOOK[key];
          const n = counts.get(key) ?? 0;
          const on = active === key;
          const label = t(`industries.${key}`, { defaultValue: key === 'other' ? 'Other' : key });
          return (
            <li key={key} className={!all && i >= FIRST_PHONE && !on ? 'hidden sm:block' : undefined}>
              <button type="button" onClick={() => onPick(on ? '' : key)} aria-pressed={on} data-deal-tile={key}
                className="group relative isolate block w-full h-full text-left focus:outline-none">
                {/* The glow behind the tile. */}
                <span aria-hidden="true"
                  className={`absolute -inset-2 -z-10 rounded-[28px] blur-xl transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-60 group-hover:opacity-95 group-focus-visible:opacity-95'}`}
                  style={{ background: `radial-gradient(60% 70% at 25% 30%, ${look.a}, transparent 70%), radial-gradient(60% 70% at 80% 75%, ${look.b}, transparent 70%)` }} />
                <span className={`relative flex flex-col items-center justify-center gap-2 h-full rounded-2xl border bg-white/85 backdrop-blur-sm px-2 py-4 text-center shadow-sm transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md ${on ? 'border-[#37352F] ring-2 ring-[#37352F]/10' : 'border-white/70'}`}>
                  <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-[26px] leading-none"
                    style={{ background: `linear-gradient(135deg, ${look.a}26, ${look.b}33)` }} aria-hidden="true">{look.emoji}</span>
                  <span className="text-[13px] sm:text-sm font-medium text-[#37352F] leading-tight break-words">{label}</span>
                  <span className="text-[11px] text-gray-500 leading-none min-h-[11px]">
                    {n > 0 ? (n === 1 ? t('deals.page.countOne', { defaultValue: '1 deal' }) : t('deals.page.count', { defaultValue: '{{n}} deals', n })) : ''}
                  </span>
                  {on && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#37352F] text-white flex items-center justify-center" aria-hidden="true">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {(order.length > FIRST && activeIdx < FIRST) && (
        <div className="text-center mt-5">
          <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} data-deal-tiles-more
            className="inline-flex items-center gap-1.5 rounded-full border notion-border bg-white px-4 py-2 text-sm font-medium text-[#37352F] hover:bg-[#F7F7F5] transition">
            {all ? t('deals.page.browseLess', { defaultValue: 'Show fewer' }) : t('deals.page.browseAll', { defaultValue: 'All business types' })}
            <ChevronDown className={`w-4 h-4 transition-transform ${all ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
    </section>
  );
}
