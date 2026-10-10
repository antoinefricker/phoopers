import { Box, ScrollArea } from '@mantine/core';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { TimelineRow, LABEL_WIDTH } from './TimelineRow';
import { fractionOf, rowsOf } from './timelineGeometry';
import { useEditorContext } from './useEditorContext';

export function Timeline() {
  const { selection, select, removeKeyframe } = useEditorContext();
  const { timeline, branchId, currentTimeRef, subscribe, seek } = usePlaybackContext();
  const playheadRef = useRef<HTMLDivElement>(null);
  const { duration } = timeline;

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
        {rowsOf(timeline).map((row) => (
          <TimelineRow
            key={row.entityId}
            row={row}
            duration={duration}
            selection={selection}
            onSelectKeyframe={(entityId, t) => {
              select({ kind: 'keyframe', entityId, t });
              seek(t);
            }}
          />
        ))}
        <Box style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_WIDTH, right: 0, pointerEvents: 'none' }}>
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
