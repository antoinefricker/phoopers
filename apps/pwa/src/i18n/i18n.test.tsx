import { render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import i18n, { SUPPORTED_LOCALES } from './i18n';

function Strings() {
  const { t } = useTranslation();
  return (
    <>
      <h1>{t('play.transport.play', 'Play')}</h1>
      <p>{t('play.emptyProbe', 'inline default')}</p>
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

    expect(screen.getByRole('heading', { name: 'Lecture' })).toBeInTheDocument();
  });

  it('falls back to the English catalogue rather than rendering an empty string', async () => {
    // A key that exists ONLY in the English catalogue, never as an inline default. If
    // fallbackLng stops working, t() returns the inline default and this assertion fails —
    // asserting on a string that is also the inline default would be rescued by it.
    i18n.addResource('en', 'common', 'play.fallbackProbe', 'catalogue-only value');
    await i18n.changeLanguage('fr');

    expect(i18n.t('play.fallbackProbe' as 'play.transport.play', 'inline default')).toBe('catalogue-only value');
  });

  it('renders the English default when the French value is empty', async () => {
    // Present in English, present but empty in French. returnEmptyString: false must make
    // i18next fall through to the English catalogue value (not the inline default, not nothing).
    i18n.addResource('en', 'common', 'play.emptyProbe', 'english catalogue value');
    i18n.addResource('fr', 'common', 'play.emptyProbe', '');
    await i18n.changeLanguage('fr');
    render(<Strings />);

    expect(screen.getByText('english catalogue value')).toBeInTheDocument();
  });
});
