import { createContext, useContext } from 'react';
import type { BranchId, ResolvedTimeline } from '../engine';

export interface PlaybackContextValue {
  timeline: ResolvedTimeline;
  branchId: BranchId;
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
