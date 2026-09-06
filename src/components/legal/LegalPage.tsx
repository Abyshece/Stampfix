import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '../Logo';
import { useTranslation } from 'react-i18next';

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Shared chrome for the Privacy Policy and Terms pages: a simple centered
 * reading column with a back link and consistent typography. Kept
 * deliberately plain — legal text should be easy to read, not flashy.
 */
export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-white text-[#37352F]">
      <header className="border-b notion-border sticky top-0 bg-white/90 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold text-sm hover:opacity-70 transition">
            <Logo className="h-6 w-auto text-[#37352F]" />
            Stampfix
          </a>
          <a href="/" className="text-sm text-gray-500 hover:text-[#37352F] flex items-center gap-1 transition">
            <ArrowLeft className="w-4 h-4" /> {t('legal.backHome', { defaultValue: 'Back to home' })}
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-serif-display font-semibold mb-2">{title}</h1>
        <p className="text-sm text-gray-400 mb-10">{t('legal.updated', { defaultValue: 'Last updated:' })} {lastUpdated}</p>
        <div className="legal-body space-y-6 text-[15px] leading-relaxed text-gray-700">
          {children}
        </div>
      </main>

      <footer className="border-t notion-border mt-16">
        <div className="max-w-3xl mx-auto px-6 py-8 text-sm text-gray-400 flex flex-col sm:flex-row justify-between gap-2">
          <span>{t('footer.rights', { defaultValue: '© 2026 Stampfix' })}</span>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-[#37352F]">{t('footer.privacy', { defaultValue: 'Privacy' })}</a>
            <a href="/terms" className="hover:text-[#37352F]">{t('footer.terms', { defaultValue: 'Terms' })}</a>
            <a href="/dpa" className="hover:text-[#37352F]">{t('footer.dpa', { defaultValue: 'DPA' })}</a>
            <a href="/impressum" className="hover:text-[#37352F]">{t('footer.impressum', { defaultValue: 'Impressum' })}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Section heading used inside legal pages. */
export function LegalH2({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-serif-display font-semibold text-[#37352F] pt-6">{children}</h2>;
}

/** Highlighted placeholder so unfilled legal details are impossible to miss. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="bg-yellow-100 text-yellow-900 px-1 rounded font-mono text-[13px]">
      [{children}]
    </span>
  );
}
