import { useCallback, useEffect, useRef, useState } from 'react';

export interface PlaybackClock {
  currentTimeRef: React.RefObject<number>;
  displayTime: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  subscribe: (listener: (t: number) => void) => () => void;
}

const clamp = (t: number, duration: number): number => {
  if (!Number.isFinite(t)) {
    return 0;
  }
  return Math.min(Math.max(t, 0), Math.max(duration, 0));
};

export function usePlaybackClock(duration: number): PlaybackClock {
  const currentTimeRef = useRef(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const listenersRef = useRef(new Set<(t: number) => void>());
  const frameRef = useRef<number | null>(null);
  const lastStampRef = useRef<number | null>(null);
  const durationRef = useRef(duration);
  const shownTenthRef = useRef(0);

  // Listeners get every frame; React state only changes when the rounded tenth does, so
  // the slider and readout re-render at about 10 Hz while the DOM is written at frame rate.
  const emit = useCallback((t: number) => {
    for (const listener of listenersRef.current) {
      listener(t);
    }
    // Compare against a ref rather than inside a setState updater: React still re-renders
    // the component once for an updater that returns the same value, i.e. at 60 Hz.
    const tenth = Math.round(t * 10);
    if (tenth !== shownTenthRef.current) {
      shownTenthRef.current = tenth;
      setDisplayTime(t);
    }
  }, []);

  const seek = useCallback(
    (t: number) => {
      const next = clamp(t, durationRef.current);
      currentTimeRef.current = next;
      emit(next);
    },
    [emit],
  );

  // The duration changes when the branch changes. A clock left past the new end would
  // render a frozen frame off the end of the timeline.
  useEffect(() => {
    durationRef.current = duration;
    if (currentTimeRef.current > duration) {
      currentTimeRef.current = clamp(currentTimeRef.current, duration);
      emit(currentTimeRef.current);
    }
  }, [duration, emit]);

  useEffect(() => {
    if (!isPlaying) {
      lastStampRef.current = null;
      return;
    }

    const step = (stamp: number) => {
      const last = lastStampRef.current;
      lastStampRef.current = stamp;

      if (last !== null) {
        const next = currentTimeRef.current + (stamp - last) / 1000;
        if (next >= durationRef.current) {
          currentTimeRef.current = durationRef.current;
          emit(currentTimeRef.current);
          setIsPlaying(false);
          return;
        }
        currentTimeRef.current = next;
        emit(next);
      }

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isPlaying, emit]);

  const play = useCallback(() => {
    if (currentTimeRef.current >= durationRef.current) {
      currentTimeRef.current = 0;
      emit(0);
    }
    setIsPlaying(true);
  }, [emit]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const subscribe = useCallback((listener: (t: number) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  return { currentTimeRef, displayTime, isPlaying, play, pause, seek, subscribe };
}
