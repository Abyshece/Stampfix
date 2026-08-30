import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

/** 🌐 EN/DE language switcher. Changes the active language and remembers it.
 *  Purely presentational until strings are translated per phase. */
export function LanguageSwitcher({ className = 'inline-flex' }: { className?: string }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
  const set = (l: 'en' | 'de') => {
    void i18n.changeLanguage(l);
    try { localStorage.setItem('lang', l); } catch { /* ignore */ }
  };
  return (
    <div className={`${className} items-center gap-1 text-sm`} aria-label="Language">
      <Globe className="w-4 h-4 text-gray-400" />
      <button onClick={() => set('en')} className={lang === 'en' ? 'font-semibold text-[#37352F]' : 'text-gray-400 hover:text-[#37352F] transition'}>EN</button>
      <span className="text-gray-300">/</span>
      <button onClick={() => set('de')} className={lang === 'de' ? 'font-semibold text-[#37352F]' : 'text-gray-400 hover:text-[#37352F] transition'}>DE</button>
    </div>
  );
}
