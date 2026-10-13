import { Profiler, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Play } from '../engine';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { StepCaption } from './StepCaption';
import { usePlaybackContext, type PlaybackContextValue } from './usePlaybackContext';

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

function renderCaption(play: Play = hornsPlay, onRender: () => void = () => {}) {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={play}>
        <Capture />
        <Profiler id="caption" onRender={onRender}>
          <StepCaption />
        </Profiler>
      </PlaybackContextProvider>
    </MantineProvider>,
  );
}

const caption = () => screen.getByTestId('step-caption').textContent;

// The sample play's steps, in order, with the time each is reached.
const FIRST = hornsPlay.branches[0]?.steps[0];
const SECOND = hornsPlay.branches[0]?.steps[1];

afterEach(() => {
  api = null;
  vi.restoreAllMocks();
});

describe('StepCaption', () => {
  it('names nothing before the first step, and leaves no empty chip on the floor', () => {
    // A play opens on movement that belongs to no step yet, so the court stays bare. The
    // caption carries a background and padding, so an empty one would sit on the floor as a
    // blank tile rather than disappearing.
    renderCaption();

    expect(caption()).toBe('');
    expect(screen.getByTestId('step-caption')).not.toBeVisible();
  });

  it('becomes visible once a step is reached, and hides again before the first one', () => {
    if (FIRST === undefined) throw new Error('the sample play has no steps');
    renderCaption();

    act(() => controls().seek(FIRST.t));
    expect(screen.getByTestId('step-caption')).toBeVisible();

    act(() => controls().seek(0));
    expect(screen.getByTestId('step-caption')).not.toBeVisible();
  });

  it('names the step the playhead has reached', () => {
    if (FIRST === undefined) throw new Error('the sample play has no steps');
    renderCaption();

    act(() => controls().seek(FIRST.t));

    expect(caption()).toBe(FIRST.name);
  });

  it('keeps naming that step until the next one is reached', () => {
    if (FIRST === undefined || SECOND === undefined) throw new Error('the sample play has two steps');
    renderCaption();

    act(() => controls().seek((FIRST.t + SECOND.t) / 2));
    expect(caption()).toBe(FIRST.name);

    act(() => controls().seek(SECOND.t));
    expect(caption()).toBe(SECOND.name);
  });

  it('goes back to naming nothing when the playhead returns to the start', () => {
    if (FIRST === undefined) throw new Error('the sample play has no steps');
    renderCaption();
    act(() => controls().seek(FIRST.t));

    act(() => controls().seek(0));

    expect(caption()).toBe('');
  });

  it('follows the clock during playback without re-rendering', () => {
    // The court does no per-frame React work: the tokens write their transforms through refs,
    // and the caption writes its text the same way. A caption that re-rendered on every frame
    // would drag the whole court panel with it.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    let renders = 0;
    renderCaption(hornsPlay, () => {
      renders += 1;
    });
    const before = renders;

    act(() => controls().play());
    for (let i = 0; i < 200; i += 1) act(() => void vi.advanceTimersByTime(16));

    expect(caption()).not.toBe('');
    expect(renders).toBe(before);
    vi.useRealTimers();
  });
});
