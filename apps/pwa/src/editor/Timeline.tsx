import { Box, ScrollArea } from '@mantine/core';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlayerId } from '../engine';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { StepRuler } from './StepRuler';
import { forkTimeOf } from './mutations';
import { TimelineRow, LABEL_WIDTH } from './TimelineRow';
import { TRACK_INSET_PX, fractionOf, rowsOf } from './timelineGeometry';
import { useEditorContext } from './useEditorContext';
import { DRAG_SLOP_PX } from './useTimeDrag';

export function Timeline() {
  const { t } = useTranslation();
  const { play, selection, select, removeKeyframe, movePlayer } = useEditorContext();
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

  // Pointer and keyboard both: a handle that only answers a mouse would be the one control in
  // this editor that a keyboard cannot reach.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_SLOP_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sortableIds = timeline.players.map((player) => player.id);
  // dnd-kit identifies by `UniqueIdentifier`, so the comparison crosses the branded id on
  // purpose: these three only ever read what the sortable list was given.
  const nameOf = (id: string) => timeline.players.find((player) => String(player.id) === id)?.label ?? id;
  const positionOf = (id: string) => sortableIds.findIndex((candidate) => String(candidate) === id) + 1;

  // dnd-kit speaks English by default, which would be the one untranslated thing a French
  // screen-reader user hears in this interface.
  const instructions = t(
    'play.editor.reorderInstructions',
    'Press space to pick the row up, the arrow keys to move it, space again to drop it, escape to cancel.',
  );
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      t('play.editor.reorderStart', 'Picked up {{name}}, position {{position}} of {{count}}.', {
        name: nameOf(String(active.id)),
        position: positionOf(String(active.id)),
        count: sortableIds.length,
      }),
    onDragOver: () => undefined,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over === null
        ? t('play.editor.reorderCancelled', 'Left {{name}} where it was.', { name: nameOf(String(active.id)) })
        : t('play.editor.reorderEnd', 'Dropped {{name}} at position {{position}} of {{count}}.', {
            name: nameOf(String(active.id)),
            position: positionOf(String(over.id)),
            count: sortableIds.length,
          }),
    onDragCancel: ({ active }: { active: { id: string | number } }) =>
      t('play.editor.reorderCancelled', 'Left {{name}} where it was.', { name: nameOf(String(active.id)) }),
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over === null || active.id === over.id) return;
    movePlayer(active.id as PlayerId, positionOf(String(over.id)) - 1);
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
        {/* Only the players are sortable: the ball leads the list and is not one. `closestCenter`
            over rows of equal height reads as "the row the pointer is over". Restricted to the
            vertical axis and to the list's own box, so a drag cannot wander across the time
            axis or out of the panel. */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
          accessibility={{ announcements, screenReaderInstructions: { draggable: instructions } }}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
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
          </SortableContext>
        </DndContext>
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
