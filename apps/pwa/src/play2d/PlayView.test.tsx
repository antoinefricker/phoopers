import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBranch, stateAt, type ResolvedTimeline, type Vec2 } from '../engine';
import { HORNS_SWITCH, hornsPlay } from '../samples/horns';
import { stubViewportWidth } from '../testUtils/viewport';
import i18n from '../i18n/i18n';
import { PlayView } from './PlayView';
import { fullCourtViewBox } from './geometry/court';

function renderView(widthPx = 1440) {
  stubViewportWidth(widthPx);
  return render(
    <MantineProvider>
      <PlayView play={hornsPlay} />
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
  const positions: Record<string, Vec2> = { ball: state.ball.position };
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

describe('PlayView', () => {
  it('renders the court, the tokens, the transport and the branch tree together', () => {
    const { container } = renderView();

    expect(screen.getByRole('img')).toHaveAttribute('viewBox', fullCourtViewBox('fiba'));
    expect(container.querySelectorAll('[data-testid="token"]')).toHaveLength(10);
    expect(container.querySelector('[data-testid="ball-token"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    const branches = within(screen.getByRole('navigation', { name: 'Play branches' }));
    expect(branches.getByRole('button', { name: 'Base' })).toBeInTheDocument();
    expect(branches.getByRole('button', { name: SWITCH_NAME })).toBeInTheDocument();
  });

  it('shows the play name as a heading, untranslated', () => {
    renderView();

    expect(screen.getByRole('heading', { name: hornsPlay.name })).toBeInTheDocument();
  });

  it('starts on the full court', () => {
    renderView();

    expect(screen.getByRole('radio', { name: 'Full court' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Half court' })).not.toBeChecked();
  });

  describe('branch sidebar', () => {
    const branchNav = () => screen.queryByRole('navigation', { name: 'Play branches' });

    it('is open by default where there is room for it beside the court', () => {
      renderView(1440);

      expect(branchNav()).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Toggle branches' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('is collapsed by default on a phone-sized screen', () => {
      renderView(375);

      expect(branchNav()).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Toggle branches' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('hides and shows the branch list when the toggle is activated', async () => {
      const user = userEvent.setup();
      renderView(1440);
      const toggle = screen.getByRole('button', { name: 'Toggle branches' });

      await user.click(toggle);
      expect(branchNav()).not.toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggle);
      expect(branchNav()).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });

    it('opens from the keyboard on a phone-sized screen', async () => {
      const user = userEvent.setup();
      renderView(375);

      screen.getByRole('button', { name: 'Toggle branches' }).focus();
      await user.keyboard('{Enter}');

      expect(branchNav()).toBeInTheDocument();
    });

    it('keeps the selected branch and playhead while collapsed', async () => {
      const user = userEvent.setup();
      renderView(1440);
      await user.click(screen.getByRole('button', { name: SWITCH_NAME }));
      await user.click(screen.getByRole('button', { name: 'Next step' }));

      await user.click(screen.getByRole('button', { name: 'Toggle branches' }));
      await user.click(screen.getByRole('button', { name: 'Toggle branches' }));

      expect(screen.getByRole('button', { name: SWITCH_NAME })).toHaveAttribute('aria-current', 'true');
      expect(screen.getByTestId('current-time')).toHaveTextContent('2.0');
    });

    it('has a translated label', async () => {
      await i18n.changeLanguage('fr');
      renderView(1440);

      expect(screen.getByRole('button', { name: 'Afficher ou masquer les variantes' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Toggle branches' })).not.toBeInTheDocument();
    });
  });

  describe('accessible names', () => {
    it('names the court image after the play, and the court toggle group', () => {
      renderView();

      expect(screen.getByRole('img', { name: `Court diagram: ${hornsPlay.name}` })).toBeInTheDocument();
      expect(screen.getByRole('radiogroup', { name: 'Court view' })).toBeInTheDocument();
    });

    it('translates the labels but leaves the play name alone', async () => {
      await i18n.changeLanguage('fr');
      renderView();

      expect(screen.getByRole('img', { name: `Schéma du terrain : ${hornsPlay.name}` })).toBeInTheDocument();
      expect(screen.getByRole('radiogroup', { name: 'Vue du terrain' })).toBeInTheDocument();
    });
  });

  describe('court toggle', () => {
    it('toggles between full and half court and back', async () => {
      const user = userEvent.setup();
      renderView();

      await user.click(screen.getByRole('radio', { name: 'Half court' }));
      expect(screen.getByRole('img')).toHaveAttribute('viewBox', '14 0 14 15');

      await user.click(screen.getByRole('radio', { name: 'Full court' }));
      expect(screen.getByRole('img')).toHaveAttribute('viewBox', fullCourtViewBox('fiba'));
    });

    it('changes the viewBox only: the drawn markup, token positions, branch and playhead are untouched', async () => {
      const user = userEvent.setup();
      const { container } = renderView();
      // Put the view in a non-initial state so a toggle that reset anything would show.
      await user.click(screen.getByRole('button', { name: SWITCH_NAME }));
      await user.click(screen.getByRole('button', { name: 'Next step' }));
      await user.click(screen.getByRole('button', { name: 'Next step' }));
      const svg = screen.getByRole('img');
      const before = {
        markup: svg.innerHTML,
        viewBox: svg.getAttribute('viewBox'),
        positions: drawnPositions(container),
        time: screen.getByTestId('current-time').textContent,
        current: screen.getByRole('button', { name: SWITCH_NAME }).getAttribute('aria-current'),
      };

      await user.click(screen.getByRole('radio', { name: 'Half court' }));

      expect(svg.getAttribute('viewBox')).not.toBe(before.viewBox);
      expect(svg.innerHTML).toBe(before.markup);
      expect(drawnPositions(container)).toEqual(before.positions);
      expect(screen.getByTestId('current-time').textContent).toBe(before.time);
      expect(screen.getByRole('button', { name: SWITCH_NAME })).toHaveAttribute('aria-current', before.current ?? '');
      expect(before.time).toBe('4.0');
      expect(before.current).toBe('true');
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
      expect(screen.getByTestId('current-time')).toHaveTextContent('8.0');
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
      expect(screen.getByTestId('current-time')).toHaveTextContent('8.0');
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
      await user.click(screen.getByRole('button', { name: SWITCH_NAME }));
      expect(screen.getByRole('button', { name: SWITCH_NAME })).toHaveAttribute('aria-current', 'true');
      expect(screen.getByTestId('current-time')).toHaveTextContent('0.0');

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
      await user.click(screen.getByRole('button', { name: 'Base' }));
      screen.getByRole('slider').focus();
      await user.keyboard('{End}');
      expectDrawnAt(container, rootTimeline, 8);
    });
  });
});
