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

export default i18n;
