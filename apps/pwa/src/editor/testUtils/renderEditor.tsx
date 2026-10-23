/* eslint-disable react-refresh/only-export-components, i18next/no-literal-string -- test harness: not app code, and one file by design so later tasks import it */
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createQueryClient } from '../../app/queryClient';
import { AuthContext, type AuthContextValue } from '../../auth/useAuthContext';
import { DraftContextProvider } from '../../draft/DraftContextProvider';
import type { DraftOrigin } from '../../draft/draftStorage';
import type { BranchId, Play } from '../../engine';
import { HiddenEntitiesContextProvider } from '../../play2d/HiddenEntitiesContextProvider';
import { PlaybackContextProvider } from '../../play2d/PlaybackContextProvider';
import { usePlaybackContext } from '../../play2d/usePlaybackContext';
import { EditorContextProvider } from '../EditorContextProvider';
import { TimelineViewportContextProvider } from '../TimelineViewportContextProvider';
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
  /** Who is signed in; defaults to nobody, on an app with no Supabase project. */
  auth?: Partial<AuthContextValue>;
  /** Where the open system was stored; defaults to never. */
  origin?: DraftOrigin | null;
  /** The address the router starts at. */
  path?: string;
}

const SIGNED_OUT: AuthContextValue = {
  status: 'signedOut',
  userId: null,
  configured: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
};

// The app mounts the viewport around the whole time region, so anything that positions by pixels
// can read the scale; the harness does the same, sized to the playback's own duration.
function Viewport({ children }: { children: ReactNode }) {
  const { timeline } = usePlaybackContext();

  return <TimelineViewportContextProvider duration={timeline.duration}>{children}</TimelineViewportContextProvider>;
}

export function renderEditor(
  initialPlay: Play,
  children: ReactNode,
  { wrapPlayback = true, auth = {}, origin = null, path = '/play' }: Options = {},
) {
  const client = createQueryClient();

  return render(
    <MantineProvider env="test">
      <QueryClientProvider client={client}>
        <AuthContext value={{ ...SIGNED_OUT, ...auth }}>
          <MemoryRouter initialEntries={[path]}>
            <EditorContextProvider initialPlay={initialPlay}>
              <DraftContextProvider initialOrigin={origin}>
                <HiddenEntitiesContextProvider>
                  {wrapPlayback ? (
                    <PlaybackContextProvider play={initialPlay}>
                      <Viewport>{children}</Viewport>
                      <PlayProbe />
                    </PlaybackContextProvider>
                  ) : (
                    <>
                      {children}
                      <PlayProbe />
                    </>
                  )}
                </HiddenEntitiesContextProvider>
              </DraftContextProvider>
            </EditorContextProvider>
          </MemoryRouter>
        </AuthContext>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

/**
 * Feeds the playback provider the editor's LIVE play rather than the one it started with, as the
 * app does. Without it the view is frozen at `initialPlay`: a commit reaches the model but the
 * component still renders the old times, so a second gesture counts from a stale starting point.
 * Use it with `wrapPlayback: false`, which leaves this the only provider.
 */
export function LivePlayback({ children }: { children: ReactNode }) {
  const { play } = useEditorContext();

  return (
    <PlaybackContextProvider play={play}>
      <Viewport>{children}</Viewport>
    </PlaybackContextProvider>
  );
}

/**
 * Switch mode through the system menu in the header, which is where the control lives: the
 * dropdown offers only the mode you are NOT in, so each of these is a single named entry.
 */
const pickFromMenu = async (name: string) => {
  await userEvent.click(screen.getByRole('button', { name: 'System menu' }));
  await userEvent.click(await screen.findByRole('button', { name }));
};

export const enterEditMode = () => pickFromMenu('Edit mode');
export const leaveEditMode = () => pickFromMenu('Play mode');

/**
 * The branch tree lives behind the header's menu, so a test that touches a branch opens it
 * first. Idempotent: picking a branch closes the menu, and the next call reopens it, so a test
 * can keep asking for the tree without tracking that. `PlayView` must be what was rendered.
 */
export async function branchMenu() {
  const trigger = screen.getByRole('button', { name: 'Branches' });
  if (trigger.getAttribute('aria-expanded') !== 'true') await userEvent.click(trigger);

  return within(await screen.findByRole('navigation', { name: 'Play branches' }));
}

/** A button inside the branch tree — a branch itself, or one of its fork and delete actions. */
export async function branchButton(name: string) {
  return (await branchMenu()).getByRole('button', { name });
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
