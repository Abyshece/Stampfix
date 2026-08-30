import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';

const LABELS: Record<'en' | 'de', string> = { en: 'English', de: 'Deutsch' };

/** 🌐 Language dropdown (EN/DE). Changes the active language and remembers it. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lang: 'en' | 'de' = (i18n.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';

  const set = (l: 'en' | 'de') => {
    void i18n.changeLanguage(l);
    try { localStorage.setItem('lang', l); } catch { /* ignore */ }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#37352F] px-2 py-2 transition"
        aria-haspopup="true" aria-expanded={open} aria-label="Change language"
      >
        <Globe className="w-4 h-4" />
        <span className="uppercase font-medium">{lang}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white border notion-border rounded-lg shadow-lg py-1 z-50">
          {(['en', 'de'] as const).map((l) => (
            <button
              key={l}
              onClick={() => set(l)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F7F7F5] transition ${lang === l ? 'font-semibold text-[#37352F]' : 'text-gray-600'}`}
            >
              {LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
