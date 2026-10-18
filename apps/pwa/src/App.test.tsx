import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { stubViewportWidth } from './testUtils/viewport';

function renderApp(path = '/') {
  stubViewportWidth(1440);
  window.history.pushState({}, '', path);
  return render(
    <MantineProvider env="test">
      <App />
    </MantineProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('opens on the home screen, not on the sample play', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'phoopers' })).toBeInTheDocument();
    expect(screen.queryByTestId('token')).not.toBeInTheDocument();
  });

  it('sends an unknown address to the home screen', () => {
    renderApp('/nowhere');
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'phoopers' })).toBeInTheDocument();
  });

  it('reaches the editor by creating a system from New system', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'New system' }));
    await user.type(await screen.findByRole('textbox', { name: /Name/ }), 'Flex');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(window.location.pathname).toBe('/play');
    expect(await screen.findByRole('button', { name: 'Next step' })).toBeInTheDocument();
  });

  it('does not open, nor store, an untouched blank system at /play', () => {
    renderApp('/play');
    expect(window.location.pathname).toBe('/');
    expect(localStorage.getItem('phoopers.draft.v1')).toBeNull();
  });
});
