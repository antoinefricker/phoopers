import { Box, CloseButton } from '@mantine/core';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityId, ScreenEvent, ScreenId } from '../engine';
import { ConfirmDelete } from './ConfirmDelete';
import { constrainRetime } from './constraints';
import { MARKER_WIDTH_PX, MARKER_HEIGHT_PX, TRACK_INSET_PX, fractionOf } from './timelineGeometry';
import { GUTTER_WIDTH, TIME_READOUT_PX } from '../play2d/transportMath';
import { BallSymbolBadge, PlayerSymbolBadge } from '../play2d/PlayerSymbol';
import type { TimelineRowModel } from './timelineGeometry';
import { useTimeDrag } from './useTimeDrag';
import { useEditorContext } from './useEditorContext';
import type { Selection } from './useEditorContext';
import { usePlaybackContext } from '../play2d/usePlaybackContext';

// Re-exported so the editor's own files keep one import site; the value is shared with the
// transport, whose buttons fill the same gutter.
export { GUTTER_WIDTH as LABEL_WIDTH } from '../play2d/transportMath';

interface Props {
  row: TimelineRowModel;
  duration: number;
  screens: ScreenEvent[];
  selection: Selection;
  onSelectKeyframe: (entityId: EntityId, t: number) => void;
  onKeyframeRetimed: (entityId: EntityId, fromT: number, toT: number) => void;
}

const percent = (t: number, duration: number) => `${fractionOf(t, duration) * 100}%`;

// A screen shorter than this cannot be grabbed, and `setScreenDuration` refuses a non-positive one.
export const MIN_SCREEN_DURATION = 0.1;
// A drop within this fraction of the play's length of a step snaps to it.
const SNAP_FRACTION = 0.02;

// The row is 2rem tall; the badge leaves a little air above and below.
const ROW_SYMBOL_PX = 24;

export function TimelineRow({ row, duration, screens, selection, onSelectKeyframe, onKeyframeRetimed }: Props) {
  const { t } = useTranslation();
  const { play, moveKeyframe, setScreenDuration, removeScreen } = useEditorContext();
  const { branchId, timeline } = usePlaybackContext();
  const trackRef = useRef<HTMLDivElement>(null);
  const ownTrack = play.branches.find((b) => b.id === branchId)?.tracks[row.entityId] ?? [];
  const { bind, consumeDrag } = useTimeDrag(trackRef, duration);
  // A child branch's timeline carries its ancestors' screens too. Like their keyframes and steps,
  // they belong to the ancestor: shown, but not editable from here.
  const ownScreenIds = new Set(play.branches.find((b) => b.id === branchId)?.screens.map((s) => s.id));
  // The dialog stays mounted for Mantine's exit transition; `target` outlives the close so the body
  // does not blank mid-transition, and `count` re-keys it per open (see ConfirmDelete).
  const [removing, setRemoving] = useState<{ target: ScreenId | null; opened: boolean; count: number }>({
    target: null,
    opened: false,
    count: 0,
  });
  const labelOf = (id: string) => timeline.players.find((p) => p.id === id)?.label ?? id;
  const removingScreen = screens.find((s) => s.id === removing.target);
  const isBall = row.team === 'ball';
  // The gutter draws the same token the court does rather than restating it as text, so a row
  // is recognised by the symbol the coach already reads on the floor. The badge carries the
  // name a screen reader needs, which the bare number never did — both teams used to read "2".
  const rowName = isBall
    ? t('play.editor.ballRow', 'Ball')
    : row.team === 'offense'
      ? t('play.editor.offenseRow', 'Offense {{label}}', { label: row.label })
      : t('play.editor.defenseRow', 'Defense {{label}}', { label: row.label });

  return (
    <Box data-testid={`timeline-row-${row.entityId}`} style={{ display: 'flex', alignItems: 'center', height: '2rem' }}>
      <Box w={GUTTER_WIDTH} style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {isBall ? (
          <BallSymbolBadge sizePx={ROW_SYMBOL_PX} name={rowName} />
        ) : (
          <PlayerSymbolBadge
            team={row.team === 'defense' ? 'defense' : 'offense'}
            label={row.label}
            sizePx={ROW_SYMBOL_PX}
            name={rowName}
          />
        )}
      </Box>
      {/* Inset so a marker sitting at t=0 or t=duration fits inside the track: it is a rotated
          square, so it reaches half its DIAGONAL past its time. Without this the last marker
          overflows and the panel grows a horizontal scrollbar. StepRuler and Timeline's
          overlay carry the same inset, or the playhead drifts from the markers. */}
      <Box
        ref={trackRef}
        style={{
          position: 'relative',
          flex: 1,
          height: '100%',
          marginLeft: TRACK_INSET_PX,
          marginRight: TRACK_INSET_PX + TIME_READOUT_PX,
        }}
      >
        <Box
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 1,
            background: 'var(--mantine-color-default-border)',
          }}
        />
        {screens.map((screen) => (
          <Box
            key={screen.id}
            data-testid={`screen-bar-${screen.id}`}
            data-inherited={ownScreenIds.has(screen.id) ? undefined : 'true'}
            style={{
              position: 'absolute',
              top: '20%',
              height: '60%',
              left: percent(screen.t, duration),
              width: `${(fractionOf(screen.t + screen.duration, duration) - fractionOf(screen.t, duration)) * 100}%`,
              background: 'var(--mantine-color-grape-light)',
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          >
            {ownScreenIds.has(screen.id) ? (
              <>
                {/* A button, not a div: the handle is reachable by keyboard, and the arrow keys
                    retime it through the same constraint the drag uses. */}
                <button
                  type="button"
                  data-testid={`screen-handle-${screen.id}`}
                  aria-label={t('play.editor.screenDuration', 'Screen duration')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: -3,
                    width: 6,
                    padding: 0,
                    border: 0,
                    cursor: 'ew-resize',
                    touchAction: 'none',
                    pointerEvents: 'auto',
                    background: 'var(--mantine-color-grape-filled)',
                  }}
                  {...bind({
                    current: screen.t + screen.duration,
                    // The edge cannot go left of the screen's own start: it floors at a minimum duration.
                    resolve: (rawT) => Math.max(rawT, screen.t + MIN_SCREEN_DURATION),
                    place: (element, end) => {
                      const bar = element.parentElement;
                      if (bar !== null) {
                        bar.style.width = `${(fractionOf(end, duration) - fractionOf(screen.t, duration)) * 100}%`;
                      }
                    },
                    restore: (element) => {
                      const bar = element.parentElement;
                      if (bar !== null) {
                        bar.style.width = `${(fractionOf(screen.t + screen.duration, duration) - fractionOf(screen.t, duration)) * 100}%`;
                      }
                    },
                    commit: (end) => setScreenDuration(screen.id, end - screen.t),
                  })}
                />
                <CloseButton
                  size="xs"
                  data-testid={`screen-remove-${screen.id}`}
                  aria-label={t('play.editor.removeScreen', 'Remove screen')}
                  onClick={() => setRemoving((r) => ({ target: screen.id, opened: true, count: r.count + 1 }))}
                  style={{ position: 'absolute', top: 0, bottom: 0, left: 0, height: 'auto', pointerEvents: 'auto' }}
                />
              </>
            ) : null}
          </Box>
        ))}
        {isBall &&
          row.keyframes.map((k, index) => {
            const next = row.keyframes[index + 1];
            if (next === undefined || k.attachedTo === undefined || next.attachedTo === undefined) return null;

            return (
              <Box
                key={`${k.t}-possession`}
                data-testid={`possession-${k.t}`}
                style={{
                  position: 'absolute',
                  top: '25%',
                  height: '50%',
                  left: percent(k.t, duration),
                  width: `${(fractionOf(next.t, duration) - fractionOf(k.t, duration)) * 100}%`,
                  background: 'var(--mantine-color-orange-light)',
                }}
              />
            );
          })}
        {row.keyframes.map((k, index) => {
          const selected = selection?.kind === 'keyframe' && selection.entityId === row.entityId && selection.t === k.t;
          const hollow = isBall && k.attachedTo === undefined;
          // A child branch's anchors include its ancestors' keyframes and the synthesised one at
          // its fork instant. They are not in this branch's own track, so there is nothing here
          // to retime: the marker is shown but, like the pre-fork part of the court, is locked.
          const owned = ownTrack.some((own) => own.t === k.t);

          return (
            <button
              // Keyed by position, not by time: a retime changes `k.t`, and a key change would
              // remount the button and drop the focus the keyboard nudge needs to keep. The
              // constraints forbid a keyframe crossing its neighbour, so the order never moves.
              key={index}
              type="button"
              data-kind={hollow ? 'position' : 'attached'}
              aria-pressed={selected}
              // Shape and colour carry the ball's possession on screen; neither reaches
              // assistive technology, and `data-kind` is not exposed, so the name says it.
              aria-label={
                isBall
                  ? hollow
                    ? t('play.editor.ballLooseAt', 'Ball loose at {{t}}s', { t: k.t })
                    : t('play.editor.ballHeldAt', 'Ball held at {{t}}s', { t: k.t })
                  : t('play.editor.keyframeAt', 'Keyframe at {{t}}s', { t: k.t })
              }
              onClick={() => {
                if (!consumeDrag()) onSelectKeyframe(row.entityId, k.t);
              }}
              data-inherited={owned ? undefined : 'true'}
              {...(owned
                ? bind({
                    current: k.t,
                    resolve: (rawT, snap) =>
                      constrainRetime(
                        play,
                        branchId,
                        row.entityId,
                        k.t,
                        rawT,
                        timeline.steps,
                        snap ? SNAP_FRACTION * duration : 0,
                      ),
                    place: (element, value) => {
                      element.style.left = percent(value, duration);
                    },
                    restore: (element) => {
                      element.style.left = percent(k.t, duration);
                    },
                    commit: (value) => {
                      moveKeyframe(branchId, row.entityId, k.t, value);
                      onKeyframeRetimed(row.entityId, k.t, value);
                    },
                  })
                : {})}
              style={{
                position: 'absolute',
                top: '50%',
                left: percent(k.t, duration),
                touchAction: owned ? 'none' : undefined,
                width: MARKER_WIDTH_PX,
                height: MARKER_HEIGHT_PX,
                padding: 0,
                borderRadius: 2,
                cursor: owned ? 'grab' : 'pointer',
                transform: 'translate(-50%, -50%)',
                // Selection is the border: blue and thicker, since a white fill leaves nothing
                // else to carry it.
                border: selected
                  ? `2px solid var(--mantine-color-blue-filled)`
                  : `1px solid var(--mantine-color-gray-5)`,
                // White everywhere except a held ball, which keeps a tint: the filled-versus-
                // hollow contrast used to be the only thing showing possession on screen, and
                // dropping it would leave that to the accessible name alone.
                background: isBall && !hollow ? 'var(--mantine-color-orange-1)' : 'var(--mantine-color-white)',
              }}
            />
          );
        })}
      </Box>
      <ConfirmDelete
        key={removing.count}
        opened={removing.opened}
        title={t('play.editor.removeScreenTitle', 'Remove this screen?')}
        body={t('play.editor.removeScreenBody', 'The screen set by {{screener}} for {{beneficiary}} will be removed.', {
          screener: removingScreen === undefined ? '' : labelOf(removingScreen.screenerId),
          beneficiary: removingScreen === undefined ? '' : labelOf(removingScreen.beneficiaryId),
        })}
        confirmLabel={t('play.editor.remove', 'Remove')}
        onConfirm={() => {
          if (removing.target !== null) removeScreen(removing.target);
          setRemoving((r) => ({ ...r, opened: false }));
        }}
        onClose={() => setRemoving((r) => ({ ...r, opened: false }))}
      />
    </Box>
  );
}
