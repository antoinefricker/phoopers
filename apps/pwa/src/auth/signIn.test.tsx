import { QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../app/queryClient';
import { fakeSupabaseClient, installFakeSupabase } from '../supabase/testUtils/fakeSupabase';
import { AppShell } from '../app/AppShell';
import { AuthCallbackScreen } from './AuthCallbackScreen';
import { AuthContextProvider } from './AuthContextProvider';
import { SignInScreen } from './SignInScreen';

const USER = '11111111-1111-1111-8111-111111111111';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <MantineProvider env="test">
      <QueryClientProvider client={createQueryClient()}>
        <AuthContextProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="signin" element={<SignInScreen />} />
              <Route path="auth/callback" element={<AuthCallbackScreen />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </AuthContextProvider>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

beforeEach(() => vi.resetAllMocks());

describe('signing in', () => {
  it('offers one way in', async () => {
    installFakeSupabase(fakeSupabaseClient([]));
    renderAt('/signin');
    await screen.findByRole('button', { name: /Continue with/ });
    expect(screen.getAllByRole('button', { name: /Continue with/ })).toHaveLength(1);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('carries where to come back to through the provider', async () => {
    const fake = fakeSupabaseClient([]);
    installFakeSupabase(fake);
    renderAt('/signin?next=%2Fplay');
    await userEvent.click(await screen.findByRole('button', { name: /Continue with Google/ }));
    await waitFor(() => expect(fake.client.auth.calls.signInWithOAuth).toHaveLength(1));
    expect(fake.client.auth.calls.signInWithOAuth[0]?.options.redirectTo).toBe(
      `${window.location.origin}/auth/callback?next=%2Fplay`,
    );
  });

  it('says the app is not configured rather than offering a dead button', () => {
    installFakeSupabase(null);
    renderAt('/signin');
    expect(screen.queryByRole('button', { name: /Continue with/ })).toBeNull();
    expect(screen.getByText(/not configured/)).toBeTruthy();
  });
});

describe('the return from Google', () => {
  const returning = (profiles: Array<Record<string, unknown>>) =>
    installFakeSupabase(fakeSupabaseClient([], { userId: USER, extraTables: { profiles } }));

  it('asks for a display name on the first return, before going anywhere', async () => {
    returning([]);
    renderAt('/auth/callback?next=%2Fplay');
    expect(await screen.findByText('What should we call you?')).toBeTruthy();
    expect(screen.queryByTestId('where')).toBeNull();
    expect(screen.queryByRole('button', { name: /later|skip|cancel/i })).toBeNull();
  });

  it('refuses a display name of nothing but spaces', async () => {
    const fake = fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [] } });
    installFakeSupabase(fake);
    renderAt('/auth/callback?next=%2Fplay');
    await userEvent.type(await screen.findByRole('textbox'), '   ');
    await userEvent.keyboard('{Enter}');
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fake.calls.some((call) => 'upsert' in call)).toBe(false);
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('goes where the coach was once the name is given', async () => {
    const fake = fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [] } });
    installFakeSupabase(fake);
    renderAt('/auth/callback?next=%2Fplay');
    await userEvent.type(await screen.findByRole('textbox'), '  Coach K ');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect((await screen.findByTestId('where')).textContent).toBe('/play');
    expect(fake.calls).toContainEqual({ from: 'profiles', upsert: { id: USER, display_name: 'Coach K' } });
  });

  it('goes straight on when the coach already has a name, defaulting to the home screen', async () => {
    returning([{ id: USER, display_name: 'Coach K' }]);
    renderAt('/auth/callback');
    expect((await screen.findByTestId('where')).textContent).toBe('/');
  });

  it.each([
    ['a scheme-relative address', '//evil.example'],
    ['a backslash', '/\\evil.test'],
    ['a tab between the slashes', '/\t/evil.test'],
    ['a newline between the slashes', '/\n/evil.test'],
    ['an absolute address', 'https://evil.test'],
    ['a dot segment before a double slash', '/.//evil.test'],
    ['a parent segment before a double slash', '/a/..//evil.test'],
  ])('does not follow a next that leaves the app: %s', async (_name, next) => {
    returning([{ id: USER, display_name: 'Coach K' }]);
    renderAt(`/auth/callback?next=${encodeURIComponent(next)}`);
    expect((await screen.findByTestId('where')).textContent).toBe('/');
  });

  it('says the account could not be loaded, and retries on request', async () => {
    const fake = fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [{ id: USER, display_name: 'K' }] } });
    fake.failWith('boom');
    installFakeSupabase(fake);
    renderAt('/auth/callback?next=%2Fplay');
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
    fake.failWith(null);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await screen.findByTestId('where')).textContent).toBe('/play');
  });

  it('sends a coach who is not signed in back to the sign-in screen', async () => {
    installFakeSupabase(fakeSupabaseClient([]));
    renderAt('/auth/callback?next=%2Fplay');
    expect(await screen.findByRole('button', { name: /Continue with Google/ })).toBeTruthy();
  });
});

describe('the display name dialog', () => {
  function renderMenu() {
    installFakeSupabase(
      fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [{ id: USER, display_name: 'Coach K' }] } }),
    );
    return render(
      <MantineProvider env="test">
        <QueryClientProvider client={createQueryClient()}>
          <AuthContextProvider>
            <MemoryRouter>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<p>home</p>} />
                </Route>
              </Routes>
            </MemoryRouter>
          </AuthContextProvider>
        </QueryClientProvider>
      </MantineProvider>,
    );
  }

  it('opens from the account menu, starting from the current name, and can be closed', async () => {
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: 'Coach K' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Change my display name' }));
    expect(((await screen.findByRole('textbox')) as HTMLInputElement).value).toBe('Coach K');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('What should we call you?')).toBeNull());
  });

  it('cannot be closed on the first return', async () => {
    installFakeSupabase(fakeSupabaseClient([], { userId: USER, extraTables: { profiles: [] } }));
    renderAt('/auth/callback');
    await screen.findByText('What should we call you?');
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('What should we call you?')).toBeTruthy();
  });
});
