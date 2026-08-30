import { Logo } from './Logo';
import { Instagram, Linkedin } from 'lucide-react';

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
  return (
    <footer className="border-t notion-border bg-[#FBFBFA] mt-24">
      <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-5 gap-10">
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
        ]} />
        <FooterCol title="Support" links={[
          { href: '/faq', label: 'FAQ' },
          { href: '/find-card', label: 'Find my card' },
          { href: 'mailto:hello@stampfix.app', label: 'Contact us' },
        ]} />
        <FooterCol title="Company" links={[
          { href: '/about', label: 'About' },
          { href: '/blog', label: 'Blog' },
        ]} />
        <FooterCol title="Legal" links={[
          { href: '/privacy', label: 'Privacy' },
          { href: '/cardholder-privacy', label: 'Cardholder Privacy' },
          { href: '/terms', label: 'Terms' },
          { href: '/dpa', label: 'DPA' },
          { href: '/impressum', label: 'Impressum' },
          { href: '/cookies', label: 'Cookies' },
          { href: '/accessibility', label: 'Accessibility' },
        ]} />
      </div>
      <div className="max-w-6xl mx-auto px-6 py-6 border-t notion-border text-sm text-gray-400 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span>&copy; 2026 Stampfix</span>
        <div className="flex items-center gap-4">
          {onCookieSettings && (
            <button onClick={onCookieSettings} className="hover:text-[#37352F] transition cursor-pointer">Cookie settings</button>
          )}
          <a href="https://www.instagram.com/stampfix.app/" target="_blank" rel="noopener" aria-label="Instagram" className="hover:text-[#37352F] transition"><Instagram className="w-5 h-5" /></a>
          <a href="https://www.linkedin.com/company/feemoji-app/" target="_blank" rel="noopener" aria-label="LinkedIn" className="hover:text-[#37352F] transition"><Linkedin className="w-5 h-5" /></a>
        </div>
        <span>Keep them coming back, friction-free.</span>
      </div>
    </footer>
  );
}
