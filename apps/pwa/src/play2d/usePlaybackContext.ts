import { createContext, useContext } from 'react';
import type { BranchId, ResolvedTimeline } from '../engine';

export interface PlaybackContextValue {
  timeline: ResolvedTimeline;
  branchId: BranchId;
  /**
   * The latest time the playhead may take, and where playback stops. While authoring that is the
   * whole timeline, empty time past the last keyframe included, because a keyframe is written at
   * the playhead and one past the last needs it there. While watching it is where the content stops, the later of the last keyframe
   * and the end of the last label, so playback does not run on through time in which nothing
   * happens.
   */
  end: number;
  selectBranch: (branchId: BranchId) => void;
  currentTimeRef: React.RefObject<number>;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  subscribe: (listener: (t: number) => void) => () => void;
}

export const PlaybackContext = createContext<PlaybackContextValue | null>(null);

export function usePlaybackContext(): PlaybackContextValue {
  const value = useContext(PlaybackContext);

  if (value === null) {
    throw new Error('usePlaybackContext must be used inside a PlaybackContextProvider');
  }

  return value;
}
