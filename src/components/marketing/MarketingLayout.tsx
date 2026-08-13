import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Logo } from '../Logo';
import { MobileNav } from '../MobileNav';

const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/use-cases', label: 'Use cases' },
  { href: '/savings', label: 'Payback' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
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
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <a href="/?login=1" className="text-gray-600 hover:text-[#37352F] px-2 py-2 text-sm transition whitespace-nowrap hidden sm:inline">Log in</a>
            <StartButton className="px-4 py-2 text-sm" />
            <MobileNav
              links={[
                { href: '/find-card', label: 'My loyalty card' },
                { href: '/features', label: 'Features' },
                { href: '/pricing', label: 'Pricing' },
                { href: '/use-cases', label: 'Use cases' },
                { href: '/savings', label: 'Payback' },
                { href: '/blog', label: 'Blog' },
                { href: '/about', label: 'About' },
                { href: '/?login=1', label: 'Log in' },
              ]}
            />
          </div>
        </div>
      </nav>

      {children}

      <footer className="border-t notion-border bg-[#FBFBFA] mt-24">
        <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <Logo className="h-6 w-auto text-[#37352F]" />
              <span className="font-semibold">Stampfix</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
              No apps to download. No paper to lose. Just loyalty — living right next to their Apple&nbsp;Pay and Google&nbsp;Pay.
            </p>
          </div>
          <FooterCol title="Product" links={[
            { href: '/features', label: 'Features' },
            { href: '/pricing', label: 'Pricing' },
            { href: '/use-cases', label: 'Use cases' },
            { href: '/savings', label: 'Payback' },
            { href: '/wallet-guide', label: 'Apple Wallet guide' },
            { href: '/faq', label: 'FAQ' },
          ]} />
          <FooterCol title="Company" links={[
            { href: '/about', label: 'About' },
            { href: '/blog', label: 'Blog' },
          ]} />
          <FooterCol title="Legal" links={[
            { href: '/privacy', label: 'Privacy' },
            { href: '/terms', label: 'Terms' },
            { href: '/dpa', label: 'DPA' },
            { href: '/impressum', label: 'Impressum' },
            { href: '/cookies', label: 'Cookies' },
            { href: '/accessibility', label: 'Accessibility' },
          ]} />
        </div>
        <div className="max-w-6xl mx-auto px-6 py-6 border-t notion-border text-sm text-gray-400 flex flex-col sm:flex-row justify-between gap-2">
          <span>&copy; 2026 Stampfix</span>
          <span>Keep them coming back, friction-free.</span>
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
