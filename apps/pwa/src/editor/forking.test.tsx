import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Play, StepId } from '../engine';
import { validatePlay } from '../engine';
import { fixturePlay, P1, P2, ROOT, SWITCH } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { setKeyframe } from './mutations';
import { dragElement, readProbe, renderEditor, trackOf } from './testUtils/renderEditor';

const STEP_LATE = 'step-late' as StepId;

// Two steps on the root, so a variant forked from the WRONG one is distinguishable.
const twoSteps: Play = {
  ...fixturePlay,
  branches: fixturePlay.branches.map((b) =>
    b.id === ROOT ? { ...b, steps: [...b.steps, { id: STEP_LATE, t: 3, name: 'Late cut' }] } : b,
  ),
};

beforeEach(() => {
  stubViewportWidth(1440);
  // Mantine's Select scrolls the active option into view; jsdom has no such method.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

const enterEditMode = async () => {
  await userEvent.click(screen.getByRole('radio', { name: 'Edit' }));
};

const branchButton = (name: string) =>
  within(screen.getByRole('navigation', { name: 'Play branches' })).getByRole('button', { name });

describe('forking a branch', () => {
  it('creates a variant with empty tracks from the chosen step, and selects it', async () => {
    renderEditor(twoSteps, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(screen.getByRole('button', { name: 'Fork from Base' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Fork from step' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Late cut', hidden: true }));
    await userEvent.click(screen.getByRole('textbox', { name: 'Variant name' }));
    await userEvent.keyboard('Weak side');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    const play = readProbe().play;
    expect(play.branches).toHaveLength(twoSteps.branches.length + 1);
    const created = play.branches.find((b) => b.name === 'Weak side');
    expect(created?.tracks).toEqual({ ball: [] });
    expect(created?.parentId).toBe(ROOT);
    expect(created?.forkStepId).toBe(STEP_LATE);
    expect(validatePlay(play)).toEqual([]);
    // The coach lands in what they just made.
    expect(branchButton('Weak side')).toHaveAttribute('aria-current', 'true');
    expect(branchButton('Base')).not.toHaveAttribute('aria-current');
  });

  it('does not create a variant without a name', async () => {
    renderEditor(twoSteps, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    await userEvent.click(screen.getByRole('button', { name: 'Fork from Base' }));

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('offers no delete action on the root, and one on every other branch', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    // The root offers no delete action at all, rather than one that fails on click.
    expect(screen.queryByRole('button', { name: 'Delete Base' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Defence switches' })).toBeInTheDocument();
  });

  it("keeps each action's visible label inside its accessible name", async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    // WCAG 2.5.3 Label in Name: a voice-control user saying "click Fork" must hit the button.
    for (const name of ['Fork from Base', 'Fork from Defence switches', 'Delete Defence switches']) {
      const button = screen.getByRole('button', { name });
      expect(button.getAttribute('aria-label') ?? '').toContain(button.textContent ?? '');
      expect(button.textContent).not.toBe('');
    }
  });

  it('offers no fork or delete action outside edit mode', () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

    expect(screen.queryByRole('button', { name: /^Fork from/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
  });

  it('falls back to the root when the selected branch is deleted', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await userEvent.click(branchButton('Defence switches'));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Defence switches' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(readProbe().play.branches.some((b) => b.id === SWITCH)).toBe(false);
    expect(branchButton('Base')).toHaveAttribute('aria-current', 'true');
  });
});

describe('the pre-fork lock', () => {
  it('dims exactly the region before the fork on a child branch', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await userEvent.click(branchButton('Defence switches'));

    // Forks at t = 2 of a 4 s branch.
    expect(screen.getByTestId('pre-fork-mask').style.width).toBe('50%');
  });

  it('shows no mask on the root branch', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    expect(screen.queryByTestId('pre-fork-mask')).not.toBeInTheDocument();
  });

  it('leaves the markers before the fork undraggable', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await userEvent.click(branchButton('Defence switches'));

    // P2's marker at the fork instant is inherited: it renders, but carries no drag handle.
    const inherited = within(screen.getByTestId(`timeline-row-${P2}`)).getAllByRole('button', { name: /^Keyframe at/ });
    const [first] = inherited;
    expect(first).toHaveAttribute('data-inherited', 'true');
    const before = readProbe().play;
    await dragElement(first as HTMLElement);

    expect(readProbe().play).toEqual(before);
    expect((first as HTMLElement).style.touchAction).not.toBe('none');
  });

  it('refuses a keyframe written before the fork even if the UI is bypassed', () => {
    // The guard that matters is in the mutation, not the mask: a presentation bug must not be
    // able to produce `keyframe-before-fork`.
    const written = setKeyframe(fixturePlay, SWITCH, P1, 0.5, { x: 1, y: 1 });

    expect(written).toEqual(fixturePlay);
    expect(trackOf(written, SWITCH, P1).some((k) => k.t === 0.5)).toBe(false);
  });
});

// P1 is the only entity that runs to t = 4, so retiming its last keyframe shortens the play.
const shortenable: Play = {
  ...fixturePlay,
  branches: fixturePlay.branches
    .filter((b) => b.id === ROOT)
    .map((b) => ({
      ...b,
      tracks: {
        ...b.tracks,
        [P2]: (b.tracks[P2] ?? []).filter((k) => k.t <= 2),
        ball: (b.tracks.ball ?? []).filter((k) => k.t <= 2),
      },
    })),
};

describe('shortening a play', () => {
  it('clamps the playhead when retiming moves the last keyframe earlier', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const marker = this.tagName === 'BUTTON';
      const width = marker ? 0 : 1200;

      return { left: 0, width, right: width, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    renderEditor(shortenable, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const markers = within(screen.getByTestId(`timeline-row-${P1}`)).getAllByRole('button', { name: /^Keyframe at/ });
    const last = markers.at(-1);
    if (last === undefined) throw new Error('expected a last marker');

    // Selecting a marker seeks to it: the playhead is now at the end.
    await userEvent.click(last);
    expect(Number.parseFloat(screen.getByTestId('current-time').textContent ?? '')).toBe(4);

    await dragElement(last);

    const longest = Math.max(...trackOf(readProbe().play, ROOT, P1).map((k) => k.t));
    expect(longest).toBeLessThan(4);
    expect(Number.parseFloat(screen.getByTestId('current-time').textContent ?? '')).toBeLessThanOrEqual(longest);
  });
});
