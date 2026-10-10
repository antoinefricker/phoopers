/* eslint-disable react-refresh/only-export-components, i18next/no-literal-string -- test harness: not app code, and one file by design so later tasks import it */
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { BranchId, Play } from '../../engine';
import { PlaybackContextProvider } from '../../play2d/PlaybackContextProvider';
import { usePlaybackContext } from '../../play2d/usePlaybackContext';
import { EditorContextProvider } from '../EditorContextProvider';
import { useEditorContext } from '../useEditorContext';

// Mirrors the Play the editor currently holds into the DOM, so a test can assert on the model
// rather than on pixels. Gestures over SVG do not produce geometry in jsdom, so what a drag
// WROTE is the only thing worth asserting about it.
function PlayProbe() {
  const { play, mode, selection } = useEditorContext();

  return <output data-testid="probe">{JSON.stringify({ play, mode, selection })}</output>;
}

interface Probed {
  play: Play;
  mode: 'play' | 'edit';
  selection: unknown;
}

export function readProbe(): Probed {
  const text = screen.getByTestId('probe').textContent ?? '{}';

  return JSON.parse(text) as Probed;
}

export function trackOf(play: Play, branchId: BranchId, entityId: string): { t: number }[] {
  return (
    play.branches.find((b) => b.id === branchId)?.tracks[entityId as keyof Play['branches'][number]['tracks']] ?? []
  );
}

interface Options {
  /**
   * Wrap the children in a `PlaybackContextProvider`. Pass `false` when the children bring their
   * own (`PlayView` does): a nested provider would silently shadow the outer clock.
   */
  wrapPlayback?: boolean;
}

export function renderEditor(initialPlay: Play, children: ReactNode, { wrapPlayback = true }: Options = {}) {
  return render(
    <MantineProvider>
      <EditorContextProvider initialPlay={initialPlay}>
        {wrapPlayback ? (
          <PlaybackContextProvider play={initialPlay}>
            {children}
            <PlayProbe />
          </PlaybackContextProvider>
        ) : (
          <>
            {children}
            <PlayProbe />
          </>
        )}
      </EditorContextProvider>
    </MantineProvider>,
  );
}

/** A button that selects a branch through the playback context, as the branch tree does. */
export function SelectBranch({ branchId }: { branchId: BranchId }) {
  const { selectBranch } = usePlaybackContext();

  return (
    <button type="button" onClick={() => selectBranch(branchId)}>
      select {branchId}
    </button>
  );
}

/** A button that seeks the shared clock. */
export function SeekTo({ t }: { t: number }) {
  const { seek } = usePlaybackContext();

  return (
    <button type="button" onClick={() => seek(t)}>
      seek {t}
    </button>
  );
}

const MOVES = [
  { clientX: 50, clientY: 50 },
  { clientX: 80, clientY: 60 },
  { clientX: 120, clientY: 90 },
];

/** Press on an element, move three times, release. Three moves is deliberate: see the commit rule. */
export async function dragElement(element: HTMLElement) {
  const user = userEvent.setup();

  await user.pointer([
    { keys: '[MouseLeft>]', target: element },
    ...MOVES.map((coords) => ({ target: element, coords })),
    { keys: '[/MouseLeft]', target: element },
  ]);
}

/** Drag an edit token on the court by entity id (a player id, or `ball`). */
export const dragToken = (entityId: string) => dragElement(screen.getByTestId(`edit-token-${entityId}`));

/** Drag a timeline marker, found by its test id. */
export const dragMarker = (testId: string) => dragElement(screen.getByTestId(testId));
