import { Logo } from './Logo';
import { Instagram, Linkedin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">{title}</h4>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="text-sm text-gray-600 hover:text-[#37352F] transition">{l.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shared site footer (marketing pages + landing). Pass onCookieSettings to
 *  render the "Cookie settings" control that reopens the consent banner. */
export function SiteFooter({ onCookieSettings }: { onCookieSettings?: () => void }) {
  const { t } = useTranslation();
  return (
    <footer className="border-t notion-border bg-[#FBFBFA] mt-24">
      <div className="max-w-6xl mx-auto px-6 pt-12">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">{t('footer.everyBusiness', { defaultValue: 'Loyalty for every kind of business' })}</h3>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {['cafe', 'restaurant', 'bakery', 'iceCream', 'snackBar', 'pizzeria', 'bar', 'florist', 'nailStudio', 'hairdresser', 'barbershop', 'tattoo', 'gym', 'retail', 'doner', 'bubbleTea', 'foodTruck', 'lashBrow', 'spa', 'carWash', 'dogGrooming', 'dryCleaner', 'yoga'].map((k) => (
            <a key={k} href="/use-cases" className="text-sm text-gray-500 hover:text-[#37352F] transition">{t(`industries.${k}`, { defaultValue: k })}</a>
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <Logo className="h-6 w-auto text-[#37352F]" />
            <span className="font-semibold">Stampfix</span>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
            {t('footer.tagline', { defaultValue: 'No apps to download. No paper to lose. Just loyalty — living right next to their Apple\u00a0Pay and Google\u00a0Pay.' })}
          </p>
        </div>
        <FooterCol title={t('footer.product', { defaultValue: 'Product' })} links={[
          { href: '/features', label: t('nav.features', { defaultValue: 'Features' }) },
          { href: '/pricing', label: t('nav.pricing', { defaultValue: 'Pricing' }) },
          { href: '/use-cases', label: t('footer.useCases', { defaultValue: 'Use cases' }) },
          { href: '/savings', label: t('footer.payback', { defaultValue: 'Payback' }) },
          { href: '/wallet-guide', label: t('footer.walletGuide', { defaultValue: 'Apple Wallet guide' }) },
        ]} />
        <FooterCol title={t('footer.support', { defaultValue: 'Support' })} links={[
          { href: '/faq', label: t('footer.faq', { defaultValue: 'FAQ' }) },
          { href: '/find-card', label: t('footer.findCard', { defaultValue: 'Find my card' }) },
          { href: 'mailto:hello@stampfix.app', label: t('footer.contactUs', { defaultValue: 'Contact us' }) },
        ]} />
        <FooterCol title={t('footer.company', { defaultValue: 'Company' })} links={[
          { href: '/about', label: t('nav.about', { defaultValue: 'About' }) },
          { href: '/blog', label: t('footer.blog', { defaultValue: 'Blog' }) },
        ]} />
        <FooterCol title={t('footer.legal', { defaultValue: 'Legal' })} links={[
          { href: '/privacy', label: t('footer.privacy', { defaultValue: 'Privacy' }) },
          { href: '/cardholder-privacy', label: t('footer.cardholderPrivacy', { defaultValue: 'Cardholder Privacy' }) },
          { href: '/terms', label: t('footer.terms', { defaultValue: 'Terms' }) },
          { href: '/dpa', label: t('footer.dpa', { defaultValue: 'DPA' }) },
          { href: '/impressum', label: t('footer.impressum', { defaultValue: 'Impressum' }) },
          { href: '/cookies', label: t('footer.cookies', { defaultValue: 'Cookies' }) },
          { href: '/accessibility', label: t('footer.accessibility', { defaultValue: 'Accessibility' }) },
        ]} />
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6 border-t notion-border text-sm text-gray-400 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span>{t('footer.rights', { defaultValue: '© 2026 Stampfix' })}</span>
        <div className="flex items-center gap-4">
          {onCookieSettings && (
            <button onClick={onCookieSettings} className="hover:text-[#37352F] transition cursor-pointer">{t('footer.cookieSettings', { defaultValue: 'Cookie settings' })}</button>
          )}
          <a href="https://www.instagram.com/stampfix.app/" target="_blank" rel="noopener" aria-label="Instagram" className="hover:text-[#37352F] transition"><Instagram className="w-5 h-5" /></a>
          <a href="https://www.linkedin.com/company/feemoji-app/" target="_blank" rel="noopener" aria-label="LinkedIn" className="hover:text-[#37352F] transition"><Linkedin className="w-5 h-5" /></a>
        </div>
        <span>{t('footer.tagline2', { defaultValue: 'Keep them coming back, friction-free.' })}</span>
      </div>
    </footer>
  );
}
