import { Profiler, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBranch, stateAt, type Play, type Vec2 } from '../engine';
import * as engine from '../engine';
import { hornsPlay, HORNS_SWITCH } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { usePlaybackContext, type PlaybackContextValue } from './usePlaybackContext';
import { TokenLayer } from './TokenLayer';

vi.mock('../engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine')>();
  return { ...actual, stateAt: vi.fn(actual.stateAt) };
});

let api: PlaybackContextValue | null = null;

function Capture() {
  const value = usePlaybackContext();
  useEffect(() => {
    api = value;
  });
  return null;
}

function controls(): PlaybackContextValue {
  if (api === null) throw new Error('context not captured');
  return api;
}

function renderTokens(play: Play = hornsPlay, onRender: () => void = () => {}) {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={play}>
        <Capture />
        <svg>
          <Profiler id="tokens" onRender={onRender}>
            <TokenLayer />
          </Profiler>
        </svg>
      </PlaybackContextProvider>
    </MantineProvider>,
  );
}

function positionOf(el: Element | null): Vec2 {
  const match = /^translate\((-?[\d.e+-]+) (-?[\d.e+-]+)\)$/.exec(el?.getAttribute('transform') ?? '');
  if (match === null) throw new Error(`no translate transform on ${el?.outerHTML}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

function tokenFor(container: HTMLElement, playerId: string): Element | null {
  return container.querySelector(`[data-testid="token"][data-player-id="${playerId}"]`);
}

const rootTimeline = resolveBranch(hornsPlay, hornsPlay.rootBranchId);

function expectTokensAt(container: HTMLElement, timeline: typeof rootTimeline, t: number) {
  const state = stateAt(timeline, t);
  for (const player of timeline.players) {
    const expected = state.players[player.id]?.position;
    if (expected === undefined) throw new Error(`no state for ${player.id}`);
    const actual = positionOf(tokenFor(container, player.id));
    expect(actual.x).toBeCloseTo(expected.x, 5);
    expect(actual.y).toBeCloseTo(expected.y, 5);
  }
  const ball = positionOf(container.querySelector('[data-testid="ball-token"]'));
  expect(ball.x).toBeCloseTo(state.ball.position.x, 5);
  expect(ball.y).toBeCloseTo(state.ball.position.y, 5);
}

afterEach(() => {
  api = null;
  vi.restoreAllMocks();
  vi.mocked(engine.stateAt).mockClear();
  vi.useRealTimers();
});

describe('TokenLayer', () => {
  it('renders one token per player in the timeline', () => {
    const { container } = renderTokens();

    expect(container.querySelectorAll('[data-testid="token"]')).toHaveLength(hornsPlay.players.length);
  });

  it('labels offense with their number and defense with an X label', () => {
    renderTokens();

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('X1')).toBeInTheDocument();
  });

  it('positions every token exactly where the sampler puts it at t = 0, not at the origin', () => {
    const { container } = renderTokens();

    expectTokensAt(container, rootTimeline, 0);
    const positions = rootTimeline.players.map((p) => positionOf(tokenFor(container, p.id)));
    expect(positions.every((p) => p.x !== 0 || p.y !== 0)).toBe(true);
    expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(positions.length);
  });

  it('renders a ball token at the sampled ball position', () => {
    const { container } = renderTokens();
    const ball = positionOf(container.querySelector('[data-testid="ball-token"]'));

    expect(ball).toEqual(stateAt(rootTimeline, 0).ball.position);
    expect(ball.x !== 0 || ball.y !== 0).toBe(true);
  });

  it('moves every token to the sampled position when the clock seeks', () => {
    const { container } = renderTokens();
    const before = rootTimeline.players.map((p) => positionOf(tokenFor(container, p.id)));

    act(() => controls().seek(rootTimeline.duration / 2));

    expectTokensAt(container, rootTimeline, rootTimeline.duration / 2);
    const after = rootTimeline.players.map((p) => positionOf(tokenFor(container, p.id)));
    expect(after.some((p, i) => p.x !== before[i]?.x || p.y !== before[i]?.y)).toBe(true);
  });

  it('writes positions during playback without re-rendering', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    let renders = 0;
    const { container } = renderTokens(hornsPlay, () => {
      renders += 1;
    });
    const rendersAtMount = renders;
    expect(rendersAtMount).toBeGreaterThan(0);

    act(() => controls().play());
    const rendersWhenPlaying = renders;
    const start = positionOf(tokenFor(container, rootTimeline.players[0]?.id ?? ''));

    // About three seconds of frames: the clock emits ~180 times and its displayTime state
    // changes ~30 times, so a layer subscribed to either would re-render dozens of times.
    for (let i = 0; i < 180; i += 1) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
    }

    expect(controls().currentTimeRef.current).toBeGreaterThan(2);
    expectTokensAt(container, rootTimeline, controls().currentTimeRef.current);
    expect(positionOf(tokenFor(container, rootTimeline.players[0]?.id ?? ''))).not.toEqual(start);
    expect(renders).toBe(rendersWhenPlaying);
  });

  it('does not re-render when the clock seeks', () => {
    let renders = 0;
    renderTokens(hornsPlay, () => {
      renders += 1;
    });
    const before = renders;

    for (let t = 0.1; t < 3; t += 0.1) {
      act(() => controls().seek(t));
    }

    expect(renders).toBe(before);
  });

  it('re-syncs to the new timeline on a branch switch, with a single subscription', () => {
    const { container } = renderTokens();
    act(() => controls().seek(1));

    act(() => controls().selectBranch(HORNS_SWITCH));
    const switched = resolveBranch(hornsPlay, HORNS_SWITCH);
    expect(controls().timeline.branchId).toBe(HORNS_SWITCH);
    expectTokensAt(container, switched, controls().currentTimeRef.current);

    // Moving at a time where the branches differ must follow the NEW timeline, and a leaked
    // subscription from the old one would double the number of attribute writes.
    const spy = vi.spyOn(Element.prototype, 'setAttribute');
    act(() => controls().seek(switched.duration));
    expectTokensAt(container, switched, switched.duration);
    const transformWrites = spy.mock.calls.filter(([name]) => name === 'transform').length;
    expect(transformWrites).toBe(switched.players.length + 1);
  });

  it('stops sampling the clock after unmount', () => {
    const { unmount } = renderTokens();
    const controlsBefore = controls();
    unmount();
    vi.mocked(engine.stateAt).mockClear();

    act(() => controlsBefore.seek(2));

    // A leaked listener would still sample the timeline, even with nothing left to write to.
    expect(engine.stateAt).not.toHaveBeenCalled();
  });

  describe('a player listed in the play but with no track in the branch', () => {
    // stateAt only reports players that have an anchors entry, so this player has no state;
    // an EMPTY track (anchors present but no keyframes) samples to the court origin instead.
    const withoutTrack: Play = {
      ...hornsPlay,
      players: [...hornsPlay.players, { id: 'bench' as never, team: 'offense', label: 'B' }],
    };
    const withEmptyTrack: Play = {
      ...withoutTrack,
      branches: withoutTrack.branches.map((b) => ({ ...b, tracks: { ...b.tracks, bench: [] } })),
    };

    it('premise: the sampler gives the missing-track player no state, and the empty-track one the origin', () => {
      const missing = resolveBranch(withoutTrack, withoutTrack.rootBranchId);
      const empty = resolveBranch(withEmptyTrack, withEmptyTrack.rootBranchId);

      expect(stateAt(missing, 0).players['bench' as never]).toBeUndefined();
      expect(stateAt(empty, 0).players['bench' as never]?.position).toEqual({ x: 0, y: 0 });
    });

    it('draws no token for it, so there is no phantom at the court corner', () => {
      const { container } = renderTokens(withoutTrack);

      expect(screen.queryByText('B')).not.toBeInTheDocument();
      expect(container.querySelectorAll('[data-testid="token"]')).toHaveLength(hornsPlay.players.length);
      act(() => controls().seek(2));
      expect(container.querySelectorAll('[data-testid="token"]')).toHaveLength(hornsPlay.players.length);
    });

    it('also draws no token for a player with an empty track, which would sample to (0, 0)', () => {
      const { container } = renderTokens(withEmptyTrack);

      expect(screen.queryByText('B')).not.toBeInTheDocument();
      expect(container.querySelectorAll('[data-testid="token"]')).toHaveLength(hornsPlay.players.length);
    });
  });
});
