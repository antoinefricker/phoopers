import { useMemo, useState, type ReactNode } from 'react';
import type { BranchId, Play } from '../engine';
import { resolveBranch } from '../engine';
import { PlaybackContext } from './usePlaybackContext';
import { usePlaybackClock } from './usePlaybackClock';

interface Props {
  play: Play;
  children: ReactNode;
}

export function PlaybackContextProvider({ play, children }: Props) {
  const [branchId, setBranchId] = useState<BranchId>(play.rootBranchId);
  const timeline = useMemo(() => resolveBranch(play, branchId), [play, branchId]);
  const clock = usePlaybackClock(timeline.duration);

  const value = useMemo(
    () => ({ timeline, branchId, selectBranch: setBranchId, ...clock }),
    [timeline, branchId, clock],
  );

  return <PlaybackContext value={value}>{children}</PlaybackContext>;
}
