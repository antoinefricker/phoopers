import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import App from './App';
import { hornsPlay } from './samples/horns';

function renderApp() {
  return render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );
}

describe('App', () => {
  it('shows the sample play as a working view, not a placeholder', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    expect(screen.getByRole('heading', { name: hornsPlay.name })).toBeInTheDocument();
    expect(screen.queryByText('Design and replay basketball plays')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="token"]')).toHaveLength(10);
    expect(within(screen.getByRole('navigation', { name: 'Play branches' })).getAllByRole('button')).toHaveLength(
      hornsPlay.branches.length,
    );

    // Wired for real: a transport press reaches the clock the court draws from.
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByTestId('current-time')).toHaveTextContent('2.0');
  });
});
