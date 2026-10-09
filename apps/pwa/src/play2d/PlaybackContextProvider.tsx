import { useMemo, useState, type ReactNode } from 'react';
import type { BranchId, Play } from '../engine';
import { resolveBranch } from '../engine';
import { PlaybackContext } from './usePlaybackContext';
import { PlaybackTimeContext } from './usePlaybackTimeContext';
import { usePlaybackClock } from './usePlaybackClock';

interface Props {
  play: Play;
  children: ReactNode;
}

export function PlaybackContextProvider({ play, children }: Props) {
  const [branchId, setBranchId] = useState<BranchId>(play.rootBranchId);
  const timeline = useMemo(() => resolveBranch(play, branchId), [play, branchId]);
  const {
    currentTimeRef,
    displayTime,
    isPlaying,
    play: start,
    pause,
    seek,
    subscribe,
  } = usePlaybackClock(timeline.duration);

  // Split by update rate: everything here is stable between branch switches and transport
  // actions, so consumers that only need the timeline do not re-render as time advances.
  const value = useMemo(
    () => ({
      timeline,
      branchId,
      selectBranch: setBranchId,
      currentTimeRef,
      isPlaying,
      play: start,
      pause,
      seek,
      subscribe,
    }),
    [timeline, branchId, currentTimeRef, isPlaying, start, pause, seek, subscribe],
  );
  const timeValue = useMemo(() => ({ displayTime }), [displayTime]);

  return (
    <PlaybackContext value={value}>
      <PlaybackTimeContext value={timeValue}>{children}</PlaybackTimeContext>
    </PlaybackContext>
  );
}
