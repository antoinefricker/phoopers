import enCommon from './locales/en/common.json';
import frCommon from './locales/fr/common.json';

export const defaultNS = 'common';

export const resources = {
  en: { common: enCommon },
  fr: { common: frCommon },
} as const;
