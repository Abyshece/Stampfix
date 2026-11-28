import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';

const LABELS: Record<'en' | 'de', string> = { en: 'English', de: 'Deutsch' };

/** 🌐 Language dropdown (EN/DE). Changes the active language and remembers it.
 *  compact: just the globe on phones (no "EN", no arrow), for crowded headers. */
export function LanguageSwitcher({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lang: 'en' | 'de' = (i18n.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';

  const set = (l: 'en' | 'de') => {
    void i18n.changeLanguage(l);
    try { localStorage.setItem('lang', l); } catch { /* ignore */ }
    setOpen(false);
  };

  // Open toward whichever side keeps the menu on-screen: right-aligned when the
  // button sits in the right half of the viewport (menu extends left), otherwise
  // left-aligned. Keeps it fully visible on mobile and laptop, wherever the
  // switcher is placed (left-hand dashboard header, right-hand customer header).
  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setAlignRight(rect.left > window.innerWidth / 2);
    }
    setOpen((o) => !o);
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
        onClick={toggle}
        className={`inline-flex items-center gap-1 text-sm text-gray-600 hover:text-[#37352F] py-2 transition px-2`}
        aria-haspopup="true" aria-expanded={open} aria-label="Change language" data-lang-switch
      >
        <Globe className={compact ? 'w-[18px] h-[18px] sm:w-4 sm:h-4' : 'w-4 h-4'} />
        <span className={`uppercase font-medium ${compact ? 'hidden sm:inline' : ''}`}>{lang}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''} ${compact ? 'hidden sm:block' : ''}`} />
      </button>
      {open && (
        <div className={`absolute ${alignRight ? 'right-0' : 'left-0'} mt-1 w-36 max-w-[calc(100vw-1.5rem)] bg-white border notion-border rounded-lg shadow-lg py-1 z-50`}>
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
