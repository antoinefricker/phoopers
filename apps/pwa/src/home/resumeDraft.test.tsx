import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryProvider } from '../app/QueryProvider';
import { AuthContext } from '../auth/useAuthContext';
import { DRAFT_KEY, readDraft, writeDraft } from '../draft/draftStorage';
import { hornsPlay } from '../samples/horns';
import { HomeScreen } from './HomeScreen';

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderHome() {
  return render(
    <MantineProvider env="test">
      <QueryProvider>
        <AuthContext
          value={{
            status: 'signedOut',
            userId: null,
            configured: true,
            signInWithGoogle: async () => {},
            signOut: async () => {},
          }}
        >
          <MemoryRouter>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="*" element={<Where />} />
            </Routes>
          </MemoryRouter>
        </AuthContext>
      </QueryProvider>
    </MantineProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('starting a system with one in progress', () => {
  it('keeps the home screen at three cards, whatever is stored', () => {
    writeDraft({ play: hornsPlay, origin: null });
    renderHome();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
  });

  it('asks, naming the draft, when New system is chosen', async () => {
    writeDraft({ play: hornsPlay, origin: null });
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(hornsPlay.name);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('resumes on /play with the draft intact', async () => {
    writeDraft({ play: hornsPlay, origin: null });
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/play');
    expect(readDraft()?.play.id).toBe(hornsPlay.id);
  });

  it('shows the creation dialog, without a discard warning, on Start a new one', async () => {
    writeDraft({ play: hornsPlay, origin: null });
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start a new one' }));
    expect(await screen.findByRole('textbox', { name: /Name/ })).toBeInTheDocument();
    expect(screen.queryByText(/will be discarded/)).not.toBeInTheDocument();
  });

  it('keeps the draft, and offers it again, when the new system is never created', async () => {
    writeDraft({ play: hornsPlay, origin: null });
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start a new one' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(readDraft()?.play.id).toBe(hornsPlay.id);
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('replaces the draft once the new system is created', async () => {
    writeDraft({ play: hornsPlay, origin: null });
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Start a new one' }));
    await userEvent.type(await screen.findByRole('textbox', { name: /Name/ }), 'Flex');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(readDraft()?.play.name).toBe('Flex');
  });

  it('goes straight to the creation dialog with no draft', async () => {
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    expect(await screen.findByRole('textbox', { name: /Name/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });

  it('stores the created system as the draft and opens it on /play', async () => {
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    await userEvent.type(await screen.findByRole('textbox', { name: /Name/ }), 'Flex');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/play');
    expect(readDraft()?.play.name).toBe('Flex');
  });

  it('leaves nothing stored when the creation dialog is cancelled', async () => {
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'New system' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
