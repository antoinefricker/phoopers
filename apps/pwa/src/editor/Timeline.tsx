import { Box, ScrollArea } from '@mantine/core';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { StepRuler } from './StepRuler';
import { forkTimeOf } from './mutations';
import { TimelineRow, LABEL_WIDTH } from './TimelineRow';
import { TRACK_INSET_PX, fractionOf, rowsOf } from './timelineGeometry';
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

  // `auto`, not Mantine's default `hover`: the region is only as tall as the court leaves it,
  // so whether the rows continue below the fold is something the coach has to see without
  // first moving the pointer into the panel. The bar is offset rather than laid over the
  // tracks, which end at the same x as the scrubber above them.
  return (
    <ScrollArea type="auto" offsetScrollbars="y">
      {/* Keys arrive from the focused marker button and bubble up to here. */}
      {/* Same reason as the court: dragging a marker must not highlight the row labels or a
          step name. Inputs below re-enable selection for the text they actually edit. */}
      <Box style={{ position: 'relative', userSelect: 'none' }} onKeyDown={onKeyDown}>
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
        {/* Matches the tracks' inset on both sides, so the playhead and the mask stay aligned
            with the markers rather than drifting by the inset at the far end. */}
        <Box
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${LABEL_WIDTH} + ${TRACK_INSET_PX}px)`,
            right: TRACK_INSET_PX,
            pointerEvents: 'none',
          }}
        >
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
