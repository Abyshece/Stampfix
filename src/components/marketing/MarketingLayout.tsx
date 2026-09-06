import type { ReactNode } from 'react';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ArrowRight, Instagram, Linkedin } from 'lucide-react';
import { Logo } from '../Logo';
import { MobileNav } from '../MobileNav';
import { useTranslation } from 'react-i18next';

const NAV_LINKS = [
  { href: '/features', label: 'Features', tkey: 'nav.features' },
  { href: '/pricing', label: 'Pricing', tkey: 'nav.pricing' },
  { href: '/about', label: 'About', tkey: 'nav.about' },
];

/** Primary charcoal CTA used across marketing pages. Links home, where signup lives. */
export function StartButton({ label = 'Start for free', className = '' }: { label?: string; className?: string }) {
  return (
    <a
      href="/?signup=1"
      className={`inline-flex items-center justify-center gap-2 bg-[#37352F] text-white rounded-lg font-medium hover:bg-[#2F2D28] transition shadow-sm ${className}`}
    >
      {label} <ArrowRight className="w-4 h-4" />
    </a>
  );
}

const CARD_WASH =
  'radial-gradient(closest-side, #75FBFD, transparent) 12% 25%/38% 65% no-repeat,' +
  'radial-gradient(closest-side, #510AF5, transparent) 42% 12%/38% 65% no-repeat,' +
  'radial-gradient(closest-side, #EA33B6, transparent) 72% 25%/38% 65% no-repeat,' +
  'radial-gradient(closest-side, #F0A479, transparent) 92% 62%/38% 65% no-repeat,' +
  'radial-gradient(closest-side, #1132F5, transparent) 22% 72%/38% 65% no-repeat';
const CARD_LINEAR = 'linear-gradient(90deg,#75FBFD,#1132F5,#510AF5,#EA33B6,#EA3323,#F0A479,#F7CE46,#75FBFD)';

/** White CTA banner with a soft wallet-card gradient wash + animated gradient top strip. */
export function GradientBanner({ title, subtitle, buttonLabel }: { title: string; subtitle?: string; buttonLabel: string }) {
  return (
    <section className="max-w-4xl mx-auto px-6 py-14">
      <div className="relative rounded-3xl border notion-border bg-white overflow-hidden shadow-lg px-8 py-14 text-center">
        <div className="pointer-events-none absolute inset-0 opacity-45 blur-3xl" style={{ background: CARD_WASH }} />
        <div className="absolute top-0 inset-x-0 h-1.5" style={{ background: CARD_LINEAR, backgroundSize: '200% 100%', animation: 'sf-grad 7s ease-in-out infinite' }} />
        <div className="relative">
          <h2 className="text-3xl md:text-4xl font-serif-display font-medium mb-4 leading-tight text-[#37352F]">{title}</h2>
          {subtitle && <p className="text-gray-500 mb-8 max-w-lg mx-auto">{subtitle}</p>}
          <StartButton label={buttonLabel} className="px-6 py-3" />
        </div>
      </div>
      <style>{`@keyframes sf-grad{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>
    </section>
  );
}

/** Eyebrow pill — matches the landing hero's small label chip. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 bg-[#F7F7F5] border notion-border px-3 py-1 rounded-full text-xs font-medium text-gray-500">
      {children}
    </span>
  );
}

/**
 * Shared chrome for marketing pages (About, Features, Use cases, Blog): the
 * same sticky nav + brand footer as the landing page so the new pages read as
 * one site, not bolt-ons.
 */
export function MarketingLayout({ children, active }: { children: ReactNode; active?: string }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-white text-[#37352F] font-sans selection:bg-[#37352F] selection:text-white">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b notion-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2 shrink-0" aria-label="Stampfix home">
            <Logo className="h-6 w-auto text-[#37352F]" />
            <span className="font-semibold hidden sm:inline">Stampfix</span>
          </a>
          <div className="hidden md:flex items-center gap-7 text-sm">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`transition ${active === l.href ? 'text-[#37352F] font-medium' : 'text-gray-500 hover:text-[#37352F]'}`}
              >
                {t(l.tkey, { defaultValue: l.label })}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <a href="/?login=1" className="text-gray-600 hover:text-[#37352F] px-2 py-2 text-sm transition whitespace-nowrap hidden sm:inline">{t('nav.login', { defaultValue: 'Log in' })}</a>
            <StartButton label={t('nav.startFree', { defaultValue: 'Start for free' })} className="px-4 py-2 text-sm" />
            <LanguageSwitcher className="hidden sm:block" />
            <MobileNav
              links={[
                { href: '/find-card', label: t('nav.myCard', { defaultValue: 'My loyalty card' }) },
                { href: '/features', label: t('nav.features', { defaultValue: 'Features' }) },
                { href: '/pricing', label: t('nav.pricing', { defaultValue: 'Pricing' }) },
                { href: '/about', label: t('nav.about', { defaultValue: 'About' }) },
                { href: '/?login=1', label: t('nav.login', { defaultValue: 'Log in' }) },
              ]}
            />
          </div>
        </div>
      </nav>

      {children}

      <footer className="border-t notion-border bg-[#FBFBFA] mt-24">
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
            <a href="https://www.instagram.com/stampfix.app/" target="_blank" rel="noopener" aria-label="Instagram" className="hover:text-[#37352F] transition"><Instagram className="w-5 h-5" /></a>
            <a href="https://www.linkedin.com/company/feemoji-app/" target="_blank" rel="noopener" aria-label="LinkedIn" className="hover:text-[#37352F] transition"><Linkedin className="w-5 h-5" /></a>
          </div>
          <span>{t('footer.tagline2', { defaultValue: 'Keep them coming back, friction-free.' })}</span>
        </div>
      </footer>
    </div>
  );
}

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
