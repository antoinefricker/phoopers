import { Box, ScrollArea } from '@mantine/core';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useEffect, useRef } from 'react';
import type { ComponentProps, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlayerId } from '../engine';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { snapToGrid } from '../play2d/transportMath';
import { StepRuler } from './StepRuler';
import { entityName } from './entityName';
import { forkTimeOf } from './mutations';
import { TimelineRow, LABEL_WIDTH } from './TimelineRow';
import { SCROLLBAR_GUTTER_PX, TRACK_INSET_PX, fractionOf, rowsOf, timeFromClientX } from './timelineGeometry';
import { useEditorContext } from './useEditorContext';
import { DRAG_SLOP_PX } from './useTimeDrag';
import { useTimelineViewportContext } from './useTimelineViewportContext';

export function Timeline() {
  const { t } = useTranslation();
  const { play, selection, select, removeKeyframe, movePlayer } = useEditorContext();
  const { timeline, branchId, currentTimeRef, subscribe, seek, pause } = usePlaybackContext();
  const playheadRef = useRef<HTMLDivElement>(null);
  // The overlay the playhead lives on IS the time axis: it is already inset to where t=0 and
  // t=duration fall, so measuring it needs no arithmetic of its own. It takes no pointer events,
  // which does not stop it being measured.
  const axisRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const { duration } = timeline;
  const { pxPerCell } = useTimelineViewportContext();
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

  /**
   * Anywhere on the tracks or the ruler moves the playhead, and holding the button scrubs.
   *
   * It reaches only the empty parts of the timeline by construction rather than by a list of
   * exceptions: every gesture in here — a bar, a handle, a marker — is bound through
   * `useTimeDrag`, whose `onPointerDown` stops propagation precisely so an ancestor cannot act
   * on an event it has taken. The guard below is for the controls that are not gestures at all:
   * the row menu, a remove button, a rename field.
   */
  const scrubTo = (clientX: number, rect: DOMRect) => {
    // The grid, as the scrubber does: a step, a screen or a keyframe created here takes the time
    // the playhead reads, and a continuous one would put them between two cells.
    seek(snapToGrid(timeFromClientX(clientX, rect, pxPerCell, duration)));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select') !== null) return;
    const rect = axisRef.current?.getBoundingClientRect();
    // Outside the axis is the label column, whose width belongs to the names and not to time.
    // A press there is left alone rather than clamped to t=0.
    if (rect === undefined || event.clientX < rect.left || event.clientX > rect.right) return;

    scrubbing.current = true;
    // Captured so the gesture survives the pointer leaving the panel, as a scrubber's does.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Once, on the press: a manual move stops playback, which is the transport's rule too.
    pause();
    scrubTo(event.clientX, rect);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    const rect = axisRef.current?.getBoundingClientRect();
    // Clamped from here on, unlike the press: dragging past either end of the axis holds the
    // playhead at that end, which `timeFromClientX` already does.
    if (rect !== undefined) scrubTo(event.clientX, rect);
  };

  const endScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

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
  const nameOf = (id: string) => {
    const player = timeline.players.find((candidate) => String(candidate.id) === id);

    return player === undefined ? id : entityName(player, t);
  };
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
  // The gutter is padded here rather than through `offsetScrollbars`, whose padding appears
  // only while the bar does: the scrubber above cannot follow that, so the two axes parted
  // company as soon as the rows overflowed. The transport reserves the same width always.
  // On the viewport, not on the Box below it: an absolutely positioned child — the playhead,
  // the pre-fork mask — is laid out against its container's PADDING box, so padding there
  // would move the tracks and leave both of them behind.
  return (
    <ScrollArea
      type="auto"
      // Cast because Mantine types this as plain div props, which reject a `data-` key on an
      // object literal although JSX accepts them on the element itself.
      viewportProps={{ 'data-testid': 'timeline-viewport' } as ComponentProps<'div'>}
      styles={{ viewport: { paddingRight: SCROLLBAR_GUTTER_PX } }}
    >
      {/* Keys arrive from the focused marker button and bubble up to here. */}
      {/* Same reason as the court: dragging a marker must not highlight the row labels or a
          step name. Inputs below re-enable selection for the text they actually edit. */}
      <Box
        data-testid="timeline-surface"
        style={{ position: 'relative', userSelect: 'none' }}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        {/* Positioned, and above the grid `PlayView` draws behind this whole region: the rows
            and the ruler have no background of their own, so without a layer of their own the
            grid paints over their markers. The playhead's layer sits above both. */}
        <Box data-testid="timeline-content" style={{ position: 'relative', zIndex: 1 }}>
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
        </Box>
        {/* Matches the tracks' inset on both sides, so the playhead and the mask stay aligned
            with the markers rather than drifting by the inset at the far end. */}
        <Box
          ref={axisRef}
          data-testid="timeline-axis"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${LABEL_WIDTH} + ${TRACK_INSET_PX}px)`,
            right: TRACK_INSET_PX,
            pointerEvents: 'none',
            zIndex: 2,
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
