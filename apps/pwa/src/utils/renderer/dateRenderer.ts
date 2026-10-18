import i18n from '../../i18n/i18n';

/** Every user-facing date goes through here, in the language the app is currently in. */
const locale = () => i18n.resolvedLanguage ?? i18n.language ?? 'en';

export const printDate = (value: string | Date): string =>
  new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(value));

export const printDateTime = (value: string | Date): string =>
  new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
