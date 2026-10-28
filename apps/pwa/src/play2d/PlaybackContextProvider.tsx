import { useContext, useMemo, useState, type ReactNode } from 'react';
import type { BranchId, Play } from '../engine';
import { contentEnd, resolveBranch } from '../engine';
import { EditorContext } from '../editor/useEditorContext';
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
  // Read with `useContext` rather than `useEditorContext`: this provider also runs with no editor
  // around it (the transport's tests do), and there the play is only watched. Authoring reaches
  // the whole timeline; watching stops at the last keyframe.
  const editing = useContext(EditorContext)?.mode === 'edit';
  const end = editing ? timeline.duration : contentEnd(timeline);
  const { currentTimeRef, displayTime, isPlaying, play: start, pause, seek, subscribe } = usePlaybackClock(end);

  // Split by update rate: everything here is stable between branch switches and transport
  // actions, so consumers that only need the timeline do not re-render as time advances.
  const value = useMemo(
    () => ({
      timeline,
      branchId,
      end,
      selectBranch: setBranchId,
      currentTimeRef,
      isPlaying,
      play: start,
      pause,
      seek,
      subscribe,
    }),
    [timeline, branchId, end, currentTimeRef, isPlaying, start, pause, seek, subscribe],
  );
  const timeValue = useMemo(() => ({ displayTime }), [displayTime]);

  return (
    <PlaybackContext value={value}>
      <PlaybackTimeContext value={timeValue}>{children}</PlaybackTimeContext>
    </PlaybackContext>
  );
}
