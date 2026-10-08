import { render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import i18n, { SUPPORTED_LOCALES } from './i18n';

function Strings() {
  const { t } = useTranslation();
  return (
    <>
      <h1>{t('app.title', 'Phoopers')}</h1>
      <p>{t('app.tagline', 'Design and replay basketball plays')}</p>
    </>
  );
}

describe('i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('supports English and French', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'fr']);
  });

  it('uses the French value when the key is translated', async () => {
    await i18n.changeLanguage('fr');
    render(<Strings />);

    expect(
      screen.getByRole('heading', { name: 'Phoopers — Tableau tactique' }),
    ).toBeInTheDocument();
  });

  it('falls back to English rather than rendering an empty string', async () => {
    await i18n.changeLanguage('fr');
    render(<Strings />);

    // fr/common.json has "app.tagline": "" — returnEmptyString: false must make
    // i18next fall through to the English catalogue instead of rendering nothing.
    expect(screen.getByText('Design and replay basketball plays')).toBeInTheDocument();
  });
});
