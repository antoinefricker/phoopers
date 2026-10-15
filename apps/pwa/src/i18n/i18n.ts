import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { defaultNS, resources } from './resources';

export const SUPPORTED_LOCALES = ['en', 'fr'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    defaultNS,
    ns: ['common'],
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
  });

// Assistive technology picks its voice and its pronunciation from `<html lang>`, so the
// document has to say which language it is actually in. Set on every change and once at start,
// because the detector may have resolved a language before anything subscribed.
const trackDocumentLanguage = (language: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
};

i18n.on('languageChanged', trackDocumentLanguage);
trackDocumentLanguage(i18n.resolvedLanguage ?? SUPPORTED_LOCALES[0]);

export default i18n;
