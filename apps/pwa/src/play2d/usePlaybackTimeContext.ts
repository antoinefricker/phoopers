import { createContext, useContext } from 'react';

export interface PlaybackTimeContextValue {
  displayTime: number;
}

export const PlaybackTimeContext = createContext<PlaybackTimeContextValue | null>(null);

export function usePlaybackTimeContext(): PlaybackTimeContextValue {
  const value = useContext(PlaybackTimeContext);

  if (value === null) {
    throw new Error('usePlaybackTimeContext must be used inside a PlaybackContextProvider');
  }

  return value;
}
