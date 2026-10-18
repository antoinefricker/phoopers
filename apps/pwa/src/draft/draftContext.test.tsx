import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlayerId } from '../engine';
import { EditorContextProvider } from '../editor/EditorContextProvider';
import { useEditorContext } from '../editor/useEditorContext';
import { hornsPlay } from '../samples/horns';
import { DraftContextProvider } from './DraftContextProvider';
import { fingerprint, readDraft, type DraftOrigin } from './draftStorage';
import { useDraftContext } from './useDraftContext';

const stored: DraftOrigin = {
  playId: hornsPlay.id,
  ownerId: '11111111-1111-1111-8111-111111111111',
  isPublic: false,
  fingerprint: fingerprint(hornsPlay),
};

function Probe() {
  const { play, renamePlayer } = useEditorContext();
  const { isDirty, origin, markSaved, discard } = useDraftContext();
  const playerId = play.players[0]!.id as PlayerId;

  return (
    <>
      <output data-testid="dirty">{String(isDirty)}</output>
      <output data-testid="origin">{JSON.stringify(origin)}</output>
      <button type="button" onClick={() => renamePlayer(playerId, 'Edited')}>
        edit
      </button>
      <button type="button" onClick={() => markSaved({ ...stored, fingerprint: fingerprint(play) })}>
        save
      </button>
      <button type="button" onClick={discard}>
        discard
      </button>
    </>
  );
}

const renderDraft = (initialOrigin: DraftOrigin | null) =>
  render(
    <EditorContextProvider initialPlay={hornsPlay}>
      <DraftContextProvider initialOrigin={initialOrigin}>
        <Probe />
      </DraftContextProvider>
    </EditorContextProvider>,
  );

const dirty = () => screen.getByTestId('dirty').textContent;

beforeEach(() => {
  localStorage.clear();
});

describe('DraftContextProvider', () => {
  it('writes the open system to storage on every edit', async () => {
    renderDraft(null);
    expect(readDraft()?.play).toEqual(hornsPlay);

    await userEvent.click(screen.getByRole('button', { name: 'edit' }));

    const written = readDraft()?.play;
    expect(written).not.toEqual(hornsPlay);
    expect(written?.players[0]).toMatchObject({ label: 'Edited' });
  });

  it('does not write a draft identical to the stored one', () => {
    renderDraft(null);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    renderDraft(null);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('is dirty from the start for a system that was never stored', () => {
    renderDraft(null);
    expect(dirty()).toBe('true');
  });

  it('is clean for a stored system nobody has touched', () => {
    renderDraft(stored);
    expect(dirty()).toBe('false');
  });

  it('is dirty again after one edit, and clean again once marked saved', async () => {
    renderDraft(stored);
    await userEvent.click(screen.getByRole('button', { name: 'edit' }));
    expect(dirty()).toBe('true');

    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(dirty()).toBe('false');
    expect(readDraft()?.origin?.fingerprint).toBe(fingerprint(readDraft()!.play));
  });

  it('clears the stored draft on discard', async () => {
    renderDraft(null);
    expect(readDraft()).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'discard' }));
    expect(readDraft()).toBeNull();
  });

  it('throws outside its provider, naming both names', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe2 />)).toThrow(/useDraftContext.*DraftContextProvider/);
    spy.mockRestore();
  });
});

function Probe2() {
  useDraftContext();
  return null;
}
