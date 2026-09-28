import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, X, ArrowRight } from 'lucide-react';
import {
  listMyDashboardBanners, dismissDashboardBanner,
  type DashboardBanner, type BannerTab, type BannerVariant,
} from '../services/merchantBanners';

/** Same colours as the promo banner on the public site. */
const VARIANT_STYLES: Record<BannerVariant, { bar: string; button: string }> = {
  red: { bar: 'bg-red-600 text-white', button: 'text-red-700' },
  blue: { bar: 'bg-blue-600 text-white', button: 'text-blue-700' },
  green: { bar: 'bg-green-600 text-white', button: 'text-green-700' },
  amber: { bar: 'bg-amber-500 text-white', button: 'text-amber-700' },
};

/** The text to show: the German version when the dashboard is in German and
 *  a German headline was written, otherwise English (never a mix). */
export function bannerText(b: DashboardBanner, german: boolean) {
  const de = german && !!b.headline_de;
  return {
    headline: de ? (b.headline_de as string) : b.headline,
    body: de ? b.body_de : b.body,
    cta: (de && b.cta_label_de) || b.cta_label,
  };
}

/** One banner bar. Also used as the live preview in the admin form. */
export function MerchantBannerView({ banner, german = false, onCta, onDismiss }: {
  banner: DashboardBanner;
  german?: boolean;
  onCta?: () => void;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const style = VARIANT_STYLES[banner.variant] ?? VARIANT_STYLES.blue;
  const text = bannerText(banner, german);
  const hasCta = !!text.cta && !!(banner.cta_tab || banner.cta_url);
  return (
    <div role="region" aria-label={t('dash.banner.label', { defaultValue: 'Announcement from Stampfix' })}
      className={`${style.bar} rounded-lg px-4 py-2.5 flex items-start sm:items-center gap-3 text-sm shadow-sm`}>
      <Megaphone className="w-4 h-4 opacity-80 flex-shrink-0 mt-0.5 sm:mt-0" />
      {/* On phones the button sits under the text so the headline keeps the full width. */}
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-x-2 gap-y-1 flex-wrap break-words">
          <span className="font-medium">{text.headline}</span>
          {text.body && <span className="opacity-85 text-xs">{text.body}</span>}
        </div>
        {hasCta && (
          <button type="button" onClick={onCta}
            className={`self-start sm:self-auto flex-shrink-0 inline-flex items-center gap-1 bg-white ${style.button} text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-white/90 transition`}>
            {text.cta} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <button type="button" onClick={onDismiss}
        className="opacity-70 hover:opacity-100 flex-shrink-0 p-1.5 -m-1.5"
        aria-label={t('dash.promo.dismissBanner', { defaultValue: 'Dismiss banner' })}>
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Announcements from Stampfix at the top of the dashboard (Admin → Merchant
 * Banners). Shows the newest one the merchant hasn't closed; closing it or
 * using its button hides it for good, on every device. The dashboard decides
 * where it may appear (owner only, never on the scanner) via `visible`, so
 * the list is fetched once rather than on every tab change.
 */
export function MerchantDashboardBanner({ visible, onOpenTab }: { visible: boolean; onOpenTab: (tab: BannerTab) => void }) {
  const { i18n } = useTranslation();
  const [banners, setBanners] = useState<DashboardBanner[]>([]);

  useEffect(() => {
    let live = true;
    listMyDashboardBanners()
      .then((b) => { if (live) setBanners(b); })
      .catch(() => { /* announcements are optional — never block the dashboard */ });
    return () => { live = false; };
  }, []);

  const banner = banners[0];
  if (!visible || !banner) return null;

  const close = (clicked: boolean) => {
    setBanners((prev) => prev.filter((b) => b.id !== banner.id));
    void dismissDashboardBanner(banner.id, clicked).catch(() => { /* hidden for this visit anyway */ });
  };

  const onCta = () => {
    close(true);
    if (banner.cta_tab) onOpenTab(banner.cta_tab);
    else if (banner.cta_url) window.open(banner.cta_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mb-6">
      <MerchantBannerView
        banner={banner}
        german={i18n.language?.toLowerCase().startsWith('de')}
        onCta={onCta}
        onDismiss={() => close(false)}
      />
    </div>
  );
}
