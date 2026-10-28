import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsContextProvider } from './SettingsContextProvider';
import { useSettingsContext } from './useSettingsContext';

beforeEach(() => localStorage.clear());

function Probe() {
  const { settings, setSetting } = useSettingsContext();

  return (
    <>
      <p data-testid="value">{String(settings.showHitAreas)}</p>
      <button type="button" onClick={() => setSetting('showHitAreas', !settings.showHitAreas)}>
        toggle
      </button>
    </>
  );
}

const renderProbe = () =>
  render(
    <SettingsContextProvider>
      <Probe />
    </SettingsContextProvider>,
  );

describe('the settings context', () => {
  it('reads every setting as its default until the coach changes one', () => {
    renderProbe();

    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });

  it('reads a setting the coach never changed as its default, whatever else is stored', () => {
    localStorage.setItem('phoopers-settings', JSON.stringify({ somethingElse: 1 }));

    renderProbe();

    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });

  it('applies a change at once and keeps it for the next visit', async () => {
    const { unmount } = renderProbe();

    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('value')).toHaveTextContent('false');

    unmount();
    renderProbe();

    expect(screen.getByTestId('value')).toHaveTextContent('false');
  });

  it('throws when read outside a provider', () => {
    expect(() => render(<Probe />)).toThrow(/useSettingsContext.*SettingsContextProvider/);
  });
});
