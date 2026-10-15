import { SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from './i18n';

/**
 * Picks the interface language.
 *
 * The options are derived from `SUPPORTED_LOCALES` rather than written out: a code reads the
 * same in every language, so none of them is a string to translate, and registering a locale
 * there adds its button without touching this file.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <SegmentedControl
      aria-label={t('app.language', 'Language')}
      // `resolvedLanguage`, not `language`: a browser set to fr-FR gives the latter a tag that
      // matches no option, which would leave the control with nothing selected.
      value={i18n.resolvedLanguage ?? SUPPORTED_LOCALES[0]}
      onChange={(value) => void i18n.changeLanguage(value)}
      data={SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: locale.toUpperCase() }))}
    />
  );
}
