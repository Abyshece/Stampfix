import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import de from './locales/de';

/** Remembered choice; defaults to English. (Browser auto-detect can be added
 *  once German strings are in place.) */
function initialLang(): 'en' | 'de' {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'de' || saved === 'en') return saved;
  } catch { /* localStorage may be unavailable */ }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export default i18n;
