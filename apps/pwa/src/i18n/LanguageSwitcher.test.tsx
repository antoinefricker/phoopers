import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import i18n, { SUPPORTED_LOCALES } from './i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

const renderSwitcher = () =>
  render(
    <MantineProvider>
      <LanguageSwitcher />
    </MantineProvider>,
  );

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('LanguageSwitcher', () => {
  it('offers one option per supported locale, named by its code', () => {
    // Derived from SUPPORTED_LOCALES rather than written out, so adding a locale adds its
    // button without touching this component.
    renderSwitcher();

    for (const locale of SUPPORTED_LOCALES) {
      expect(screen.getByRole('radio', { name: locale.toUpperCase() })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('radio')).toHaveLength(SUPPORTED_LOCALES.length);
  });

  it('shows the language in use as the selected one', () => {
    renderSwitcher();

    expect(screen.getByRole('radio', { name: 'EN' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'FR' })).not.toBeChecked();
  });

  it('changes the language when another is picked', async () => {
    renderSwitcher();

    await userEvent.click(screen.getByRole('radio', { name: 'FR' }));

    expect(i18n.resolvedLanguage).toBe('fr');
  });

  it('translates what is already on screen', async () => {
    // The point of the control. The string has to live in a component that calls
    // `useTranslation`, as every string in this app does: `i18n.t` read straight into the tree
    // is evaluated once and never hears the change.
    function Translated() {
      const { t } = useTranslation();

      return <p>{t('play.editor.remove', 'Remove')}</p>;
    }
    render(
      <MantineProvider>
        <LanguageSwitcher />
        <Translated />
      </MantineProvider>,
    );
    expect(screen.getByText('Remove')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'FR' }));

    expect(await screen.findByText('Supprimer')).toBeInTheDocument();
  });

  it('selects the right option for a regional tag the detector may hand it', async () => {
    // A browser set to fr-FR resolves to fr; reading `language` instead of `resolvedLanguage`
    // would match no option and leave the control with nothing selected.
    await i18n.changeLanguage('fr-FR');
    renderSwitcher();

    expect(screen.getByRole('radio', { name: 'FR' })).toBeChecked();
  });

  it('tells the document which language it is in', async () => {
    // Assistive technology picks its voice and its pronunciation from `<html lang>`. A switcher
    // that leaves it behind makes the document lie about itself.
    renderSwitcher();

    await userEvent.click(screen.getByRole('radio', { name: 'FR' }));

    expect(document.documentElement.lang).toBe('fr');
  });

  it('names the group for assistive technology', () => {
    renderSwitcher();

    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
  });
});
