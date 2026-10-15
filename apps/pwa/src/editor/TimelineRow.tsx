import { ActionIcon, Box, CloseButton } from '@mantine/core';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { IconEye, IconEyeOff, IconGripVertical, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { EntityId, PlayerId, ScreenEvent, ScreenId } from '../engine';
import { useHiddenEntitiesContext } from '../play2d/useHiddenEntitiesContext';
import { useSortable } from '@dnd-kit/sortable';
import { ConfirmDelete } from './ConfirmDelete';
import { TimelineBar } from './TimelineBar';
import { constrainRetime } from './constraints';
import { MARKER_WIDTH_PX, MARKER_HEIGHT_PX, TRACK_INSET_PX, fractionOf, rowsOf } from './timelineGeometry';
import { GUTTER_WIDTH, TIME_GRID_S } from '../play2d/transportMath';
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
// One grid cell: every authored time falls on the grid, so the shortest screen is the distance
// between two of them.
export const MIN_SCREEN_DURATION = TIME_GRID_S;
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
  const numberOf = (id: string) => timeline.players.find((p) => p.id === id)?.number ?? id;
  const { hidden, toggleHidden, isolate } = useHiddenEntitiesContext();
  const { removePlayer, selection: editorSelection, select } = useEditorContext();
  // The dialog stays mounted for Mantine's exit transition, and `count` re-keys it per open,
  // the same shape the screen removal above uses.
  const [removingPlayer, setRemovingPlayer] = useState<{ opened: boolean; count: number }>({
    opened: false,
    count: 0,
  });
  const removingScreen = screens.find((s) => s.id === removing.target);
  const isBall = row.team === 'ball';
  // The ball is not sortable: it leads the list and is not a player. `disabled` keeps the row
  // in the layout and out of the reordering, the way its delete control is rendered hidden.
  const {
    attributes: sortableAttributes,
    listeners: sortableListeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.entityId, disabled: isBall });
  // The gutter draws the same token the court does rather than restating it as text, so a row
  // is recognised by the symbol the coach already reads on the floor. The badge carries the
  // name a screen reader needs, which the bare number never did — both teams used to read "2".
  const rowName = isBall
    ? t('play.editor.ballRow', 'Ball')
    : row.team === 'offense'
      ? t('play.editor.offenseRow', 'Offense {{number}}', { number: row.number })
      : t('play.editor.defenseRow', 'Defense {{number}}', { number: row.number });

  return (
    <Box
      data-testid={`timeline-row-${row.entityId}`}
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '2rem',
        // Written by dnd-kit while a row is in flight, undefined at rest. Only y is used: the
        // drag is restricted to the vertical axis, so `@dnd-kit/utilities` would be a fourth
        // package to turn one number into one string.
        transform: transform === null ? undefined : `translate3d(0, ${transform.y}px, 0)`,
        transition: transition ?? undefined,
        // Lifted over its neighbours while dragged, or the rows below paint across it.
        zIndex: isDragging ? 20 : undefined,
        position: isDragging ? 'relative' : undefined,
      }}
    >
      <Box w={GUTTER_WIDTH} style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {/* Leads the gutter, where a hand reaches to pick a row up. The listeners go on the
            handle alone rather than the row, so a drag starts here and nowhere else — the rest
            of the row is markers to grab and controls to press. */}

        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          ref={setActivatorNodeRef}
          aria-label={t('play.editor.reorderRow', 'Reorder {{label}}', { label: row.number })}
          style={{ cursor: 'grab', touchAction: 'none', visibility: isBall ? 'hidden' : 'visible' }}
          {...sortableAttributes}
          {...sortableListeners}
        >
          <IconGripVertical size={14} stroke={1.5} />
        </ActionIcon>
        <Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto' }}>
          {isBall ? (
            <BallSymbolBadge sizePx={ROW_SYMBOL_PX} name={rowName} />
          ) : (
            <PlayerSymbolBadge
              team={row.team === 'defense' ? 'defense' : 'offense'}
              number={row.number}
              sizePx={ROW_SYMBOL_PX}
              name={rowName}
            />
          )}
        </Box>
        {/* The name goes in the label, not just "Hide": eleven rows would otherwise offer a
            voice-control user eleven identical buttons. `aria-pressed` carries the state, which
            the icon alone shows only to those who can see it.
            Alt and not Ctrl: on macOS Ctrl+click IS the secondary click, so the browser opens a
            context menu and the modified click never arrives. Alt is the solo modifier in the
            drawing tools a coach is likely to have met, and it is free on every platform. */}
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          ml={4}
          aria-pressed={hidden.has(row.entityId)}
          aria-label={
            hidden.has(row.entityId)
              ? t('play.editor.showEntity', 'Show {{name}}', { name: rowName })
              : t('play.editor.hideEntity', 'Hide {{name}}', { name: rowName })
          }
          onClick={(event) =>
            event.altKey
              ? isolate(
                  row.entityId,
                  rowsOf(timeline).map((r) => r.entityId),
                )
              : toggleHidden(row.entityId)
          }
        >
          {hidden.has(row.entityId) ? <IconEyeOff size={14} stroke={1.5} /> : <IconEye size={14} stroke={1.5} />}
        </ActionIcon>
        {/* On a player's row only: the ball has no player to remove. Named after the player,
            or eleven rows would offer a voice-control user eleven identical buttons. */}

        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          mr={4}
          aria-label={t('play.editor.removePlayer', 'Remove player {{label}}', { label: row.number })}
          onClick={() => setRemovingPlayer((r) => ({ opened: true, count: r.count + 1 }))}
          style={{ visibility: isBall ? 'hidden' : 'visible' }}
        >
          <IconTrash size={14} stroke={1.5} />
        </ActionIcon>
      </Box>
      {/* Inset so a marker sitting at t=0 or t=duration fits inside the track: it is a rotated
          square, so it reaches half its DIAGONAL past its time. Without this the last marker
          overflows and the panel grows a horizontal scrollbar. StepRuler and Timeline's
          overlay carry the same inset, or the playhead drifts from the markers. */}
      <Box
        ref={trackRef}
        data-testid={`timeline-track-${row.entityId}`}
        style={{
          position: 'relative',
          flex: 1,
          height: '100%',
          marginLeft: TRACK_INSET_PX,
          marginRight: TRACK_INSET_PX,
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
          <TimelineBar
            key={screen.id}
            testId={`screen-bar-${screen.id}`}
            inherited={!ownScreenIds.has(screen.id)}
            leftPercent={percent(screen.t, duration)}
            widthPercent={`${(fractionOf(screen.t + screen.duration, duration) - fractionOf(screen.t, duration)) * 100}%`}
            background="var(--mantine-color-grape-light)"
            handle={
              ownScreenIds.has(screen.id)
                ? {
                    testId: `screen-handle-${screen.id}`,
                    label: t('play.editor.screenDuration', 'Screen duration'),
                    bind: bind({
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
                    }),
                  }
                : undefined
            }
          >
            {ownScreenIds.has(screen.id) ? (
              <CloseButton
                size="xs"
                data-testid={`screen-remove-${screen.id}`}
                aria-label={t('play.editor.removeScreen', 'Remove screen')}
                onClick={() => setRemoving((r) => ({ target: screen.id, opened: true, count: r.count + 1 }))}
                style={{ position: 'absolute', top: 0, bottom: 0, left: 0, height: 'auto', pointerEvents: 'auto' }}
              />
            ) : null}
          </TimelineBar>
        ))}
        {isBall &&
          row.keyframes.map((k, index) => {
            const next = row.keyframes[index + 1];
            if (next === undefined) return null;

            const geometry: CSSProperties = {
              position: 'absolute',
              top: '25%',
              height: '50%',
              left: percent(k.t, duration),
              width: `${(fractionOf(next.t, duration) - fractionOf(k.t, duration)) * 100}%`,
            };

            // Held, and by the same player at both ends: a pass has two attached ends too, but
            // to different players, and the ball is in the air between them with nothing to
            // tint. Tinting it read as possession and contradicted the row's own hollow marker.
            if (k.attachedTo !== undefined && k.attachedTo === next.attachedTo) {
              return (
                <Box
                  key={`${k.t}-possession`}
                  data-testid={`possession-${k.t}`}
                  style={{ ...geometry, background: 'var(--mantine-color-orange-light)' }}
                />
              );
            }

            // Everything else on the ball's row is the ball travelling. Landing in a pair of
            // hands makes it a pass; leaving one for a point on the court makes it a shot. A
            // stretch that is loose at BOTH ends — a bounce, a roll, two authored positions —
            // was shot by nobody, so it carries no name rather than claiming a shot no one took.
            const name =
              next.attachedTo !== undefined
                ? t('play.timeline.pass', 'Pass')
                : k.attachedTo === undefined
                  ? undefined
                  : t('play.timeline.shot', 'Shot');
            if (name === undefined) return null;

            return (
              <Box
                key={`${k.t}-flight`}
                data-testid={`flight-${k.t}`}
                style={{
                  ...geometry,
                  // Anchored to the marker that opens the flight rather than centred on it,
                  // and lifted clear of the tinted stretches so the word reads above the row's
                  // own line instead of level with it. The horizontal nudge is padding, not
                  // part of the transform: moving the BOX pushed the last flight's label past
                  // the end of the track, which grew the panel a horizontal scrollbar.
                  transform: 'translateY(-7px)',
                  paddingLeft: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  fontSize: 'var(--mantine-font-size-xs)',
                  color: 'var(--mantine-color-dimmed)',
                  // A flight can be a fraction of a second wide, so the label gives way rather
                  // than running over the possession on either side of it.
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                {name}
              </Box>
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
                zIndex: 10,
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
      {!isBall && (
        <ConfirmDelete
          key={`player-${removingPlayer.count}`}
          opened={removingPlayer.opened}
          title={t('play.editor.removePlayerTitle', 'Remove player {{label}}?', { label: row.number })}
          body={t(
            'play.editor.removePlayerBody',
            'Player {{label}} will be removed from every branch, together with every screen they are part of.',
            { label: row.number },
          )}
          confirmLabel={t('play.editor.remove', 'Remove')}
          onConfirm={() => {
            // A selection pointing at this player would outlive it, so it goes too. One
            // pointing at anyone else is none of this row's business.
            if (editorSelection?.entityId === row.entityId) select(null);
            removePlayer(row.entityId as PlayerId);
            setRemovingPlayer((r) => ({ ...r, opened: false }));
          }}
          onClose={() => setRemovingPlayer((r) => ({ ...r, opened: false }))}
        />
      )}
      <ConfirmDelete
        key={removing.count}
        opened={removing.opened}
        title={t('play.editor.removeScreenTitle', 'Remove this screen?')}
        body={t('play.editor.removeScreenBody', 'The screen set by {{screener}} for {{beneficiary}} will be removed.', {
          screener: removingScreen === undefined ? '' : numberOf(removingScreen.screenerId),
          beneficiary: removingScreen === undefined ? '' : numberOf(removingScreen.beneficiaryId),
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
