import { Box, ScrollArea } from '@mantine/core';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { StepRuler } from './StepRuler';
import { forkTimeOf } from './mutations';
import { TimelineRow, LABEL_WIDTH } from './TimelineRow';
import { fractionOf, rowsOf } from './timelineGeometry';
import { useEditorContext } from './useEditorContext';

export function Timeline() {
  const { play, selection, select, removeKeyframe } = useEditorContext();
  const { timeline, branchId, currentTimeRef, subscribe, seek } = usePlaybackContext();
  const playheadRef = useRef<HTMLDivElement>(null);
  const { duration } = timeline;
  const forkTime = forkTimeOf(play, branchId);

  // The playhead moves by writing its style directly, as the court tokens do, so a playing
  // clock does not re-render every row on every frame.
  useEffect(() => {
    const place = (time: number) => {
      if (playheadRef.current !== null) {
        playheadRef.current.style.left = `${fractionOf(time, duration) * 100}%`;
      }
    };

    place(currentTimeRef.current);

    return subscribe(place);
  }, [currentTimeRef, subscribe, duration]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Delete' && selection?.kind === 'keyframe') {
      // The mutation owns the rules about which keyframes may go.
      removeKeyframe(branchId, selection.entityId, selection.t);
      select(null);
    }
  };

  return (
    <ScrollArea>
      {/* Keys arrive from the focused marker button and bubble up to here. */}
      <Box style={{ position: 'relative' }} onKeyDown={onKeyDown}>
        <StepRuler />
        {rowsOf(timeline).map((row) => (
          <TimelineRow
            key={row.entityId}
            row={row}
            duration={duration}
            screens={timeline.screens.filter((screen) => screen.screenerId === row.entityId)}
            selection={selection}
            onKeyframeRetimed={(entityId, fromT, toT) => {
              // The selection names a keyframe by its time, which the drag just changed.
              if (selection?.kind === 'keyframe' && selection.entityId === entityId && selection.t === fromT) {
                select({ kind: 'keyframe', entityId, t: toT });
              }
            }}
            onSelectKeyframe={(entityId, t) => {
              select({ kind: 'keyframe', entityId, t });
              seek(t);
            }}
          />
        ))}
        <Box style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_WIDTH, right: 0, pointerEvents: 'none' }}>
          {/* Dims what the branch inherits and cannot change. Presentation only: the court layer
              and the mutations refuse the same writes on their own. */}
          {forkTime > 0 && (
            <div
              data-testid="pre-fork-mask"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: `${fractionOf(forkTime, duration) * 100}%`,
                background: 'var(--mantine-color-default-hover)',
                opacity: 0.6,
              }}
            />
          )}
          <div
            ref={playheadRef}
            data-testid="timeline-playhead"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 2,
              background: 'var(--mantine-color-red-filled)',
            }}
          />
        </Box>
      </Box>
    </ScrollArea>
  );
}
