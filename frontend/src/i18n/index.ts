import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { AppLocale } from '@repuestos/shared';
import es from './locales/es.json';
import en from './locales/en.json';

const STORAGE_KEY = 'tci-auto-zone-locale';

function readStoredLocale(): AppLocale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'es' || stored === 'en') return stored;
  return 'es';
}

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: readStoredLocale(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

export function setAppLocale(locale: AppLocale) {
  localStorage.setItem(STORAGE_KEY, locale);
  void i18n.changeLanguage(locale);
}

export default i18n;
