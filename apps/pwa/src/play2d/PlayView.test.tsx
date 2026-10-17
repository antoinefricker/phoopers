import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ballCarryAt, resolveBranch, stateAt, type ResolvedTimeline, type Vec2 } from '../engine';
import { HORNS_SWITCH, hornsPlay } from '../samples/horns';
import { stubViewportWidth } from '../testUtils/viewport';
import i18n from '../i18n/i18n';
import { EditorContextProvider } from '../editor/EditorContextProvider';
import { PlayView } from './PlayView';
import { HELD_BALL_OFFSET } from './PlayerSymbol';
import { fullCourtViewBox } from './geometry/court';
import { playheadTime } from '../testUtils/transport';

function renderView(widthPx = 1440) {
  stubViewportWidth(widthPx);
  return render(
    <MantineProvider env="test">
      <EditorContextProvider initialPlay={hornsPlay}>
        <PlayView />
      </EditorContextProvider>
    </MantineProvider>,
  );
}

const rootTimeline = resolveBranch(hornsPlay, hornsPlay.rootBranchId);
const switchTimeline = resolveBranch(hornsPlay, HORNS_SWITCH);
const SWITCH_NAME = 'Switch to the weak side';

function positionOf(el: Element | null): Vec2 {
  const match = /^translate\((-?[\d.e+-]+) (-?[\d.e+-]+)\)$/.exec(el?.getAttribute('transform') ?? '');
  if (match === null) throw new Error(`no translate transform on ${el?.outerHTML}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

/** Where every drawn token actually sits right now, read off the DOM. */
function drawnPositions(container: HTMLElement): Record<string, Vec2> {
  const positions: Record<string, Vec2> = {};
  for (const token of container.querySelectorAll('[data-testid="token"]')) {
    positions[token.getAttribute('data-player-id') ?? ''] = positionOf(token);
  }
  positions['ball'] = positionOf(container.querySelector('[data-testid="ball-token"]'));
  return positions;
}

/** Where the engine says every entity is at `t`. */
function sampledPositions(timeline: ResolvedTimeline, t: number): Record<string, Vec2> {
  const state = stateAt(timeline, t);
  // A held ball is drawn down-right of its carrier, so the token does not swallow it. The
  // offset is scaled by the carry, which crosses a release and a catch without stepping and is
  // spent by the time a shot reaches its target.
  const held = HELD_BALL_OFFSET * ballCarryAt(timeline, t);
  const positions: Record<string, Vec2> = {
    ball: { x: state.ball.position.x + held, y: state.ball.position.y + held },
  };
  for (const player of timeline.players) {
    const position = state.players[player.id]?.position;
    if (position !== undefined) positions[player.id] = position;
  }
  return positions;
}

function expectDrawnAt(container: HTMLElement, timeline: ResolvedTimeline, t: number) {
  const drawn = drawnPositions(container);
  const sampled = sampledPositions(timeline, t);
  expect(Object.keys(drawn).sort()).toEqual(Object.keys(sampled).sort());
  for (const [id, position] of Object.entries(sampled)) {
    expect(drawn[id]?.x).toBeCloseTo(position.x, 5);
    expect(drawn[id]?.y).toBeCloseTo(position.y, 5);
  }
}

const moved = (a: Vec2 | undefined, b: Vec2 | undefined) =>
  Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await i18n.changeLanguage('en');
});

/**
 * The branch tree lives in a menu in the header rather than in a panel beside the court, so a
 * test that touches a branch opens the menu first. Returns the tree's queries.
 */
const openBranchMenu = async (user: UserEvent) => {
  await user.click(screen.getByRole('button', { name: 'Branches' }));
  return within(await screen.findByRole('navigation', { name: 'Play branches' }));
};

/** Which branch the tree marks as current, read without leaving the menu open behind. */
const currentBranchFlag = async (user: UserEvent, name: string) => {
  const branches = await openBranchMenu(user);
  const flag = branches.getByRole('button', { name }).getAttribute('aria-current');
  await user.keyboard('{Escape}');
  return flag;
};

describe('PlayView', () => {
  it('renders the court, the tokens, the transport and the branch menu together', async () => {
    const user = userEvent.setup();
    const { container } = renderView();

    expect(screen.getByRole('img')).toHaveAttribute('viewBox', fullCourtViewBox('fiba'));
    expect(container.querySelectorAll('[data-testid="token"]')).toHaveLength(10);
    expect(container.querySelector('[data-testid="ball-token"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    const branches = await openBranchMenu(user);
    expect(branches.getByRole('button', { name: 'Base' })).toBeInTheDocument();
    expect(branches.getByRole('button', { name: SWITCH_NAME })).toBeInTheDocument();
  });

  it('shows the play name as a heading, untranslated', () => {
    renderView();

    expect(screen.getByRole('heading', { name: hornsPlay.name })).toBeInTheDocument();
  });

  it('draws the court the play declares, with no control to disagree', () => {
    // The sample declares no extent, which is a full court. A half-court system is drawn as one
    // in createPlayDialog.test.tsx; that the two differ only in the viewBox is PlayCanvas's test.
    renderView();

    expect(screen.getByRole('img')).toHaveAttribute('viewBox', fullCourtViewBox('fiba'));
    expect(screen.queryByRole('radiogroup', { name: 'Court view' })).not.toBeInTheDocument();
  });

  describe('branch menu', () => {
    const branchNav = () => screen.queryByRole('navigation', { name: 'Play branches' });
    const trigger = () => screen.getByRole('button', { name: 'Branches' });

    it('keeps the branch list out of the way until the menu is opened', async () => {
      const user = userEvent.setup();
      renderView();

      // The court is the whole point of the screen, so nothing of the tree is on it to begin
      // with. The trigger says it is collapsed rather than leaving that to be inferred.
      expect(branchNav()).not.toBeInTheDocument();
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');

      await user.click(trigger());

      expect(await screen.findByRole('navigation', { name: 'Play branches' })).toBeInTheDocument();
      expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes the menu once a variant is picked', async () => {
      const user = userEvent.setup();
      renderView();
      await user.click(trigger());

      await user.click(await screen.findByRole('button', { name: SWITCH_NAME }));

      // A menu that stayed open over the court after the choice was made would hide the very
      // thing the choice was about.
      await waitFor(() => expect(branchNav()).not.toBeInTheDocument());
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens from the keyboard', async () => {
      const user = userEvent.setup();
      renderView();

      trigger().focus();
      await user.keyboard('{Enter}');

      expect(await screen.findByRole('navigation', { name: 'Play branches' })).toBeInTheDocument();
    });

    it('keeps the selected branch and playhead after the menu closes', async () => {
      const user = userEvent.setup();
      renderView();
      await user.click(trigger());
      await user.click(await screen.findByRole('button', { name: SWITCH_NAME }));
      await user.click(screen.getByRole('button', { name: 'Next step' }));

      await user.click(trigger());

      expect(await screen.findByRole('button', { name: SWITCH_NAME })).toHaveAttribute('aria-current', 'true');
      expect(playheadTime()).toBeCloseTo(2.0, 5);
    });

    it('has a translated label', async () => {
      await i18n.changeLanguage('fr');
      renderView();

      expect(screen.getByRole('button', { name: 'Variantes' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Branches' })).not.toBeInTheDocument();
    });
  });

  describe('accessible names', () => {
    it('names the court image after the play', () => {
      renderView();

      expect(screen.getByRole('img', { name: `Court diagram: ${hornsPlay.name}` })).toBeInTheDocument();
    });

    it('translates the labels but leaves the play name alone', async () => {
      await i18n.changeLanguage('fr');
      renderView();

      expect(screen.getByRole('img', { name: `Schéma du terrain : ${hornsPlay.name}` })).toBeInTheDocument();
    });
  });

  describe('acceptance 2: pressing play animates and stops at the end', () => {
    it('moves the drawn tokens with the clock, then stops and returns the button to Play', async () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      const { container } = renderView();
      const start = drawnPositions(container);

      await user.click(screen.getByRole('button', { name: 'Play' }));
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
      for (let i = 0; i < 90; i += 1) act(() => void vi.advanceTimersByTime(16));

      expect(moved(drawnPositions(container)['o1'], start['o1'])).toBeGreaterThan(0.5);
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

      // Run well past the 8 s duration.
      for (let i = 0; i < 700; i += 1) act(() => void vi.advanceTimersByTime(16));

      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
      // Within the throttle window, not exactly on it: the thumb follows `displayTime`, which
      // lags the clock by up to a tenth of a second. The tokens below are the ones drawn from
      // the live clock, and they do land exactly on the duration. This used to read as exact
      // only because the readout it replaced printed one decimal, rounding 7.952 to "8.0".
      expect(8 - playheadTime()).toBeLessThan(0.1);
      expect(playheadTime()).toBeLessThanOrEqual(8);
      expectDrawnAt(container, rootTimeline, rootTimeline.duration);
    });
  });

  describe('acceptance 3: scrubbing', () => {
    it('moves every token to the sampled position for that time and pauses playback', async () => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
      const { container } = renderView();
      await user.click(screen.getByRole('button', { name: 'Play' }));
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

      screen.getByRole('slider').focus();
      await user.keyboard('{End}');

      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
      expect(playheadTime()).toBeCloseTo(8.0, 5);
      expectDrawnAt(container, rootTimeline, 8);
      // And it is not simply the opening pose: the premise would hold for any t if nothing moved.
      expect(moved(drawnPositions(container)['o1'], sampledPositions(rootTimeline, 0)['o1'])).toBeGreaterThan(1);
    });
  });

  describe('acceptance 4: stepping', () => {
    it('lands every token exactly on the sampled pose at each step time', async () => {
      const user = userEvent.setup();
      const { container } = renderView();

      await user.click(screen.getByRole('button', { name: 'Next step' }));
      expectDrawnAt(container, rootTimeline, 2);
      await user.click(screen.getByRole('button', { name: 'Next step' }));
      expectDrawnAt(container, rootTimeline, 4);
      await user.click(screen.getByRole('button', { name: 'Previous step' }));
      expectDrawnAt(container, rootTimeline, 2);
    });
  });

  describe('acceptance 5: selecting a branch', () => {
    it('replays the shared opening, then diverges after the fork', async () => {
      const user = userEvent.setup();
      const { container } = renderView();
      const rootPathsBefore = Array.from(container.querySelectorAll('[data-testid="player-path"]')).map(
        (g) => g.innerHTML,
      );
      // Premise: the two branches really are the same until the fork and different afterwards.
      expect(sampledPositions(switchTimeline, 3)).toEqual(sampledPositions(rootTimeline, 3));
      expect(moved(sampledPositions(switchTimeline, 8)['o3'], sampledPositions(rootTimeline, 8)['o3'])).toBeGreaterThan(
        1,
      );

      // Watch the base play to its end, then switch: the playhead goes back to the start.
      await user.click(screen.getByRole('button', { name: 'Next step' }));
      await user.click(screen.getByRole('button', { name: 'Next step' }));
      await user.click((await openBranchMenu(user)).getByRole('button', { name: SWITCH_NAME }));
      expect(await currentBranchFlag(user, SWITCH_NAME)).toBe('true');
      expect(playheadTime()).toBeCloseTo(0.0, 5);

      // Shared opening: the switch branch draws exactly what the base play does.
      expectDrawnAt(container, switchTimeline, 0);
      await user.click(screen.getByRole('button', { name: 'Next step' }));
      expectDrawnAt(container, switchTimeline, 2);
      expectDrawnAt(container, rootTimeline, 2);
      await user.click(screen.getByRole('button', { name: 'Next step' }));
      expectDrawnAt(container, rootTimeline, 4);

      // After the fork the tokens follow the switch branch, not the base play.
      screen.getByRole('slider').focus();
      await user.keyboard('{End}');
      expectDrawnAt(container, switchTimeline, 8);
      expect(moved(drawnPositions(container)['o3'], sampledPositions(rootTimeline, 8)['o3'])).toBeGreaterThan(1);
      // The static layer was redrawn for the new timeline too.
      const switchedPaths = Array.from(container.querySelectorAll('[data-testid="player-path"]')).map(
        (g) => g.innerHTML,
      );
      expect(switchedPaths).not.toEqual(rootPathsBefore);

      // And going back to the base play restores it.
      await user.click((await openBranchMenu(user)).getByRole('button', { name: 'Base' }));
      screen.getByRole('slider').focus();
      await user.keyboard('{End}');
      expectDrawnAt(container, rootTimeline, 8);
    });
  });
});

describe('PlayView assembly', () => {
  it('shows no timeline in play mode', () => {
    renderView();

    expect(screen.queryByTestId('step-ruler')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Problems/ })).not.toBeInTheDocument();
  });

  it('shows the timeline and the issue panel in edit mode', async () => {
    renderView();

    await userEvent.click(screen.getByRole('button', { name: 'System menu' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit mode' }));

    expect(screen.getByTestId('step-ruler')).toBeInTheDocument();
    expect(screen.getByTestId('issue-count')).toHaveTextContent('0');
  });
});
