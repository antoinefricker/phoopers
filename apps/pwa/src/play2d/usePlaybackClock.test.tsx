import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { usePlaybackClock } from './usePlaybackClock';
import { usePlaybackContext } from './usePlaybackContext';

let now = 0;
let nextId = 1;
// Pending frames keyed by id, so cancelling really removes one, and cancelling an id that
// already ran (or never existed) cannot disturb a different live frame.
let frames = new Map<number, FrameRequestCallback>();

beforeEach(() => {
  now = 0;
  nextId = 1;
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function advance(ms: number) {
  now += ms;
  const pending = frames;
  frames = new Map();
  act(() => {
    for (const frame of pending.values()) {
      frame(now);
    }
  });
}

// Frames still waiting to run: scheduled and not cancelled.
const liveFrames = () => frames.size;

describe('usePlaybackClock', () => {
  it('does not advance while paused', () => {
    const { result } = renderHook(() => usePlaybackClock(10));

    // Several frames: a clock that ran unprompted would ignore the first (baseline) one.
    advance(0);
    advance(1000);
    advance(1000);

    expect(result.current.currentTimeRef.current).toBe(0);
    expect(result.current.isPlaying).toBe(false);
    expect(liveFrames()).toBe(0);
  });

  it('advances in real time while playing', () => {
    const { result } = renderHook(() => usePlaybackClock(10));

    act(() => result.current.play());
    advance(0);
    advance(500);

    expect(result.current.currentTimeRef.current).toBeCloseTo(0.5, 2);
  });

  it('stops advancing after pause', () => {
    const { result } = renderHook(() => usePlaybackClock(10));

    act(() => result.current.play());
    advance(0);
    advance(500);
    act(() => result.current.pause());
    advance(500);
    advance(500);

    expect(result.current.currentTimeRef.current).toBeCloseTo(0.5, 2);
    expect(liveFrames()).toBe(0);
  });

  it('stops at the end rather than running past it', () => {
    const { result } = renderHook(() => usePlaybackClock(1));

    act(() => result.current.play());
    advance(0);
    advance(5000);

    expect(result.current.currentTimeRef.current).toBe(1);
    expect(result.current.isPlaying).toBe(false);
    expect(liveFrames()).toBe(0);
  });

  it('restarts from zero when played at the end', () => {
    const { result } = renderHook(() => usePlaybackClock(1));

    act(() => result.current.play());
    advance(0);
    advance(5000);
    act(() => result.current.play());
    advance(0);
    advance(250);

    expect(result.current.currentTimeRef.current).toBeCloseTo(0.25, 2);
  });

  it('clamps the clock when the duration shrinks under it', () => {
    const { result, rerender } = renderHook(({ d }) => usePlaybackClock(d), {
      initialProps: { d: 10 },
    });

    act(() => result.current.seek(8));
    expect(result.current.currentTimeRef.current).toBe(8);
    rerender({ d: 3 });

    expect(result.current.currentTimeRef.current).toBe(3);
    expect(result.current.displayTime).toBe(3);
  });

  it('cancels its pending frame on unmount', () => {
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const { result, unmount } = renderHook(() => usePlaybackClock(10));

    act(() => result.current.play());
    advance(0);
    const pendingId = [...frames.keys()][0];
    expect(pendingId).toBeDefined();
    unmount();

    expect(cancel).toHaveBeenCalledWith(pendingId);
  });

  it('survives a zero duration without producing NaN', () => {
    const { result } = renderHook(() => usePlaybackClock(0));

    act(() => result.current.play());
    advance(0);
    advance(100);
    advance(100);

    expect(result.current.currentTimeRef.current).toBe(0);
    expect(result.current.displayTime).toBe(0);
    expect(result.current.isPlaying).toBe(false);
  });

  it('seeking to a non-finite time lands on zero rather than NaN', () => {
    const { result } = renderHook(() => usePlaybackClock(10));

    act(() => result.current.seek(4));
    act(() => result.current.seek(Number.NaN));

    expect(result.current.currentTimeRef.current).toBe(0);
    expect(result.current.displayTime).toBe(0);
  });

  it('clamps seeks into the valid range', () => {
    const { result } = renderHook(() => usePlaybackClock(10));

    act(() => result.current.seek(-5));
    expect(result.current.currentTimeRef.current).toBe(0);
    act(() => result.current.seek(99));
    expect(result.current.currentTimeRef.current).toBe(10);
  });

  it('notifies subscribers each frame with the new time and stops after unsubscribe', () => {
    const { result } = renderHook(() => usePlaybackClock(10));
    const listener = vi.fn();

    let unsubscribe = () => undefined as void;
    act(() => {
      unsubscribe = result.current.subscribe(listener);
      result.current.play();
    });
    advance(0);
    advance(100);
    advance(100);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(expect.closeTo(0.2, 5));

    act(() => unsubscribe());
    advance(100);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('pushes React state about 10 times a second, not every frame', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return usePlaybackClock(10);
    });
    const listener = vi.fn();
    act(() => {
      result.current.subscribe(listener);
      result.current.play();
    });
    advance(0);
    const rendersBefore = renders;

    // One second of 60 fps frames.
    for (let i = 0; i < 60; i += 1) {
      advance(1000 / 60);
    }

    expect(listener).toHaveBeenCalledTimes(60);
    expect(renders - rendersBefore).toBeLessThanOrEqual(12);
    expect(renders - rendersBefore).toBeGreaterThanOrEqual(8);
    expect(result.current.currentTimeRef.current).toBeCloseTo(1, 2);
    expect(result.current.displayTime).toBeCloseTo(1, 0);
  });
});

describe('usePlaybackContext', () => {
  it('throws outside its provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => usePlaybackContext())).toThrow(/usePlaybackContext.*PlaybackContextProvider/s);
  });

  it('exposes the resolved timeline inside its provider', () => {
    const { result } = renderHook(() => usePlaybackContext(), {
      wrapper: ({ children }) => <PlaybackContextProvider play={hornsPlay}>{children}</PlaybackContextProvider>,
    });

    expect(result.current.branchId).toBe(hornsPlay.rootBranchId);
    expect(result.current.timeline.duration).toBeGreaterThan(0);
  });

  it('switches timeline when a branch is selected', () => {
    const other = hornsPlay.branches.find((b) => b.id !== hornsPlay.rootBranchId);
    expect(other).toBeDefined();
    const { result } = renderHook(() => usePlaybackContext(), {
      wrapper: ({ children }) => <PlaybackContextProvider play={hornsPlay}>{children}</PlaybackContextProvider>,
    });
    const rootTimeline = result.current.timeline;

    act(() => result.current.selectBranch(other?.id ?? hornsPlay.rootBranchId));

    expect(result.current.branchId).toBe(other?.id);
    expect(result.current.timeline).not.toBe(rootTimeline);
  });
});
