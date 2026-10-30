import { ActionIcon, Box, Menu, Text } from '@mantine/core';
import { useRef, useState } from 'react';
import { IconDots, IconEye, IconEyeOff, IconGripVertical, IconPencil, IconTrash, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { EntityId, PlayerId, ScreenEvent, ScreenId } from '../engine';
import { spanKindAt } from '../engine';
import { useHiddenEntitiesContext } from '../play2d/useHiddenEntitiesContext';
import { useSortable } from '@dnd-kit/sortable';
import { ConfirmDelete } from './ConfirmDelete';
import { entityName } from './entityName';
import { RenamePlayer } from './RenamePlayer';
import { BarActionButton } from './bar/BarActionButton';
import { BarHandle } from './bar/BarHandle';
import { TimeMarker } from './bar/TimeMarker';
import { TrackBar } from './bar/TrackBar';
import { constrainRetime } from './constraints';
import { barResize, cellPx, leftPx, rowsOf, spanPx } from './timelineGeometry';
import { TimeWindow } from './TimeWindow';
import { GUTTER_WIDTH, TIME_GRID_S } from '../play2d/transportMath';
import { BallSymbolBadge, PlayerSymbolBadge } from '../play2d/PlayerSymbol';
import type { TimelineRowModel } from './timelineGeometry';
import { useTimeDrag } from './useTimeDrag';
import { useTimelineViewportContext } from './useTimelineViewportContext';
import { snapRadiusSeconds, xOfTime } from './timelineScale';
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

// A screen shorter than this cannot be grabbed, and `setScreenDuration` refuses a non-positive one.
// One grid cell: every authored time falls on the grid, so the shortest screen is the distance
// between two of them.
export const MIN_SCREEN_DURATION = TIME_GRID_S;
// The row is 2rem tall; the badge leaves a little air above and below.
const ROW_SYMBOL_PX = 24;
// Between a keyframe marker and the caption of the bar it sits on.
const MARKER_CAPTION_GAP_PX = 4;
// One tint per kind of stretch, each distinct from the blue of a screen and the orange of possession.
const PASS_BACKGROUND = 'var(--mantine-color-grape-light)';
const SHOT_BACKGROUND = 'var(--mantine-color-red-light)';
const DRIBBLE_BACKGROUND = 'var(--mantine-color-teal-light)';

export function TimelineRow({ row, duration, screens, selection, onSelectKeyframe, onKeyframeRetimed }: Props) {
  const { t } = useTranslation();
  const { play, moveKeyframe, setScreenDuration, removeScreen } = useEditorContext();
  const { branchId, timeline } = usePlaybackContext();
  const { pxPerCell } = useTimelineViewportContext();
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
  // Through the same helper as the row's own name, so a player the coach renamed is named that
  // way in the screen dialog too rather than falling back to a bare number.
  const nameOfPlayer = (id: string) => {
    const player = timeline.players.find((p) => p.id === id);

    return player === undefined ? id : entityName(player, t);
  };

  // The keyframe markers sit above the bars and fill the cell that begins at their time, so one at
  // the start of a screen, which is where a screen is usually set, covered the first letters of
  // its caption. The caption starts after the right edge of whatever starts within a cell of the
  // bar's start, with a small gap, and at the bar's own padding when nothing does.
  const markerClearance = (screenT: number): number => {
    const cell = xOfTime(TIME_GRID_S, pxPerCell);
    let rightEdge = 0;
    for (const keyframe of row.keyframes) {
      if (Math.abs(keyframe.t - screenT) < TIME_GRID_S - 1e-9) {
        rightEdge = Math.max(rightEdge, xOfTime(keyframe.t - screenT, pxPerCell) + cell);
      }
    }

    return rightEdge === 0 ? 0 : rightEdge + MARKER_CAPTION_GAP_PX;
  };
  const { hidden, toggleHidden, isolate } = useHiddenEntitiesContext();
  const { removePlayer, renamePlayer, selection: editorSelection, select } = useEditorContext();
  // The dialog stays mounted for Mantine's exit transition, and `count` re-keys it per open,
  // the same shape the screen removal above uses.
  const [removingPlayer, setRemovingPlayer] = useState<{ opened: boolean; count: number }>({
    opened: false,
    count: 0,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  // Same shape as the removal above: kept mounted for the exit transition, re-keyed per open so
  // the field starts from the player's current name without an effect writing state.
  const [renaming, setRenaming] = useState<{ opened: boolean; count: number }>({ opened: false, count: 0 });
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
  // `entityName` is shared with the court and the selection bar, so a renamed player reads the
  // same everywhere and the fallback cannot drift between them.
  const rowName = entityName(row, t);
  // A selected keyframe names its entity, so its row reads as selected too.
  const rowSelected = editorSelection?.entityId === row.entityId;

  return (
    <Box
      data-testid={`timeline-row-${row.entityId}`}
      data-selected={rowSelected ? 'true' : undefined}
      ref={setNodeRef}
      // On the press, not the click: the timeline captures the pointer to scrub, which would
      // retarget the click away from the row. The controls keep their own meaning, and a marker
      // binds its own press and stops it, so only the row's bare surface selects.
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (!event.currentTarget.contains(event.target as Node)) return;
        if ((event.target as HTMLElement).closest('button, a, input, textarea, select') !== null) return;
        select({ kind: 'entity', entityId: row.entityId });
      }}
      style={{
        // Mostly transparent (40% of the colour), and on the colour rather than on the row, so the
        // markers, the names and the grid lines behind keep their full strength: enough to mark
        // the row, not enough to compete with what is on it.
        background: rowSelected
          ? 'light-dark(color-mix(in srgb, var(--mantine-color-gray-1) 40%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 40%, transparent))'
          : undefined,
        display: 'flex',
        alignItems: 'center',
        height: '2rem',
        // One line under every row, across the gutter and the track, so each entity's row reads as
        // a band of its own. Inside the 2rem (the box is border-box), so the rows keep their pitch.
        borderBottom: '1px solid var(--mantine-color-default-border)',
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
      {/* Outside the window below it, and so outside the scroll: a coach at t = 14 s can still
          rename or hide a player without scrolling back to the start of the play. */}
      <Box
        data-testid={`row-gutter-${row.entityId}`}
        w={GUTTER_WIDTH}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
      >
        {/* Leads the gutter, where a hand reaches to pick a row up. The listeners go on the
            handle alone rather than the row, so a drag starts here and nowhere else — the rest
            of the row is markers to grab and controls to press. */}

        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          ref={setActivatorNodeRef}
          aria-label={t('play.editor.reorderRow', 'Reorder {{label}}', { label: rowName })}
          style={{ cursor: 'grab', touchAction: 'none', visibility: isBall ? 'hidden' : 'visible' }}
          {...sortableAttributes}
          {...sortableListeners}
        >
          <IconGripVertical size={14} stroke={1.5} />
        </ActionIcon>
        {/* `minWidth: 0` on both, or the name refuses to shrink below its text and pushes the
            hide and remove controls out of the gutter instead of ellipsing. */}
        <Box
          style={{
            flexGrow: 1,
            flexShrink: 1,
            flexBasis: 'auto',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
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
          {/* Beside the symbol, not instead of it: the symbol says which side, the name says
              which player. The gutter is narrow — about 82px are left here — so a long name
              ellipses and carries the whole of itself in `title`. Hidden from assistive
              technology because the badge beside it already carries the very same string as its
              accessible name, and a screen reader would otherwise read every row twice. */}
          <Text
            size="xs"
            truncate="end"
            title={rowName}
            aria-hidden
            data-testid={`row-name-${row.entityId}`}
            style={{ minWidth: 0 }}
          >
            {rowName}
          </Text>
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
        {/* On a player's row only: the ball is neither named nor removed, having no record in
            `play.players` to hold either. It keeps the space so every row's controls line up.
            A menu rather than two more buttons: the gutter is 180px and already holds four
            controls, and a fifth would take the width the name needs — measured, "Attaquant 1"
            is 55px of the 82 left beside the symbol. Trading the delete button for this one
            costs nothing and buys the rename an obvious home.
            Every entry is named after the player, or eleven rows would offer a voice-control
            user eleven identical commands. */}
        {/* Portalled, which is Mantine's default and is load-bearing here: the row lives inside
            the tracks' scroll area, and a dropdown rendered in place is clipped by it — measured
            at 57px of the menu cut off below the viewport's edge. jsdom has no layout, so no
            test can see this; it is why the menu is opened in a browser before it is believed. */}
        <Menu opened={menuOpen} onChange={setMenuOpen} position="bottom-end" shadow="md" trapFocus>
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              mr={4}
              aria-label={t('play.editor.rowActions', 'Actions for {{label}}', { label: rowName })}
              onClick={() => setMenuOpen((open) => !open)}
              style={{ visibility: isBall ? 'hidden' : 'visible' }}
            >
              <IconDots size={14} stroke={1.5} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown data-testid={`row-menu-${row.entityId}`}>
            <Menu.Item
              leftSection={<IconPencil size={14} stroke={1.5} />}
              onClick={() => setRenaming((r) => ({ opened: true, count: r.count + 1 }))}
            >
              {t('play.editor.renamePlayer', 'Rename {{label}}', { label: rowName })}
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} stroke={1.5} />}
              onClick={() => setRemovingPlayer((r) => ({ opened: true, count: r.count + 1 }))}
            >
              {t('play.editor.removePlayer', 'Remove player {{label}}', { label: rowName })}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>
      {/* The track is as wide as the play is long and the window clips it, so a row that runs
          past the fold is scrolled to rather than squeezed. The window carries the inset a
          marker on the last time needs at the end, as the ruler's and the playhead's do: the
          three have to agree, or the playhead drifts from the markers. */}
      <TimeWindow testId={`timeline-window-${row.entityId}`} contentRef={trackRef} overhangEndPx={pxPerCell}>
        <Box
          data-testid={`timeline-track-${row.entityId}`}
          style={{ position: 'relative', width: '100%', height: '100%' }}
        >
          {screens.map((screen) => (
            <TrackBar
              key={screen.id}
              testId={`screen-bar-${screen.id}`}
              inherited={!ownScreenIds.has(screen.id)}
              left={leftPx(screen.t, pxPerCell)}
              width={spanPx(screen.t, screen.t + screen.duration, pxPerCell)}
              // The offense's blue: a block reads as belonging to the attack rather than carrying
              // a colour of its own.
              background="var(--mantine-color-blue-light)"
              handleWidth={cellPx(pxPerCell)}
              messageClearPx={markerClearance(screen.t)}
              endHandle={
                ownScreenIds.has(screen.id) ? (
                  <BarHandle
                    testId={`screen-handle-${screen.id}`}
                    label={t('play.editor.screenDuration', 'Screen duration')}
                    bind={bind({
                      current: screen.t + screen.duration,
                      // The handle fills the bar's last cell, and the end it sets is its right edge.
                      anchor: 'end',
                      // The edge cannot go left of the screen's own start: it floors at a minimum duration.
                      resolve: (rawT) => Math.max(rawT, screen.t + MIN_SCREEN_DURATION),
                      ...barResize(screen.t, screen.t + screen.duration, pxPerCell),
                      commit: (end) => setScreenDuration(screen.id, end - screen.t),
                    })}
                  />
                ) : null
              }
              actions={
                ownScreenIds.has(screen.id)
                  ? [
                      <BarActionButton
                        key="remove"
                        testId={`screen-remove-${screen.id}`}
                        label={t('play.editor.removeScreen', 'Remove screen')}
                        icon={<IconX size={12} stroke={1.5} />}
                        // The bar's own colour, as the step label bar's controls wear theirs.
                        iconColor="var(--mantine-color-blue-filled)"
                        hoverBackground="var(--mantine-color-blue-light-hover)"
                        width={cellPx(pxPerCell)}
                        onClick={() => setRemoving((r) => ({ target: screen.id, opened: true, count: r.count + 1 }))}
                      />,
                    ]
                  : []
              }
              // What the block IS, which nothing said before: a bar carried no meaning on its own,
              // and the beneficiary only appeared in the removal dialog. The row already names the
              // screener, so the message names the other half. Elided by the bar when it is too
              // narrow — the full text stays in the DOM, and an ellipsis is a painting, so a
              // screen reader reads all of it either way.
              message={t('play.editor.screenFor', 'Screen for {{label}}', {
                label: nameOfPlayer(screen.beneficiaryId),
              })}
            />
          ))}
          {isBall &&
            row.keyframes.map((k, index) => {
              const next = row.keyframes[index + 1];
              if (next === undefined) return null;

              // Where the stretch sits on the row, as a bar's own box: its time and its width.
              const left = leftPx(k.t, pxPerCell);
              const width = spanPx(k.t, next.t, pxPerCell);

              // Held, and by the same player at both ends: a pass has two attached ends too, but
              // to different players, and the ball is in the air between them with nothing to
              // tint. Tinting it read as possession and contradicted the row's own hollow marker.
              if (k.attachedTo !== undefined && k.attachedTo === next.attachedTo) {
                return (
                  <TrackBar
                    key={`${k.t}-possession`}
                    testId={`possession-${k.t}`}
                    left={left}
                    width={width}
                    top="25%"
                    height="50%"
                    background="var(--mantine-color-orange-light)"
                  />
                );
              }

              // Everything else on the ball's row is the ball travelling. Landing in a pair of
              // hands makes it a pass; leaving one for a point on the court makes it a shot. A
              // stretch that is loose at BOTH ends — a bounce, a roll, two authored positions —
              // was shot by nobody, so it carries no name rather than claiming a shot no one took.
              const isPass = next.attachedTo !== undefined;
              const name = isPass
                ? t('play.timeline.pass', 'Pass')
                : k.attachedTo === undefined
                  ? undefined
                  : t('play.timeline.shot', 'Shot');
              if (name === undefined) return null;

              return (
                <TrackBar
                  key={`${k.t}-flight`}
                  testId={`flight-${k.t}`}
                  left={left}
                  width={width}
                  top="25%"
                  height="50%"
                  background={isPass ? PASS_BACKGROUND : SHOT_BACKGROUND}
                  // Past the marker that opens the flight, which fills the first cell of the box
                  // and sits above it. A flight can be a fraction of a second wide, so the word
                  // gives way rather than running over the possession on either side of it.
                  messageClearPx={xOfTime(TIME_GRID_S, pxPerCell) + MARKER_CAPTION_GAP_PX}
                  message={name}
                />
              );
            })}
          {/* A dribble is the player moving while holding the ball, so it is read off the ball's own
              stretches: those held by this player at both ends, and where they move. A player's own
              keyframes would not do, since one can span a pass and be held for only part of it. */}
          {!isBall &&
            (timeline.anchors['ball'] ?? []).map((k, index, ballKeyframes) => {
              const next = ballKeyframes[index + 1];
              if (next === undefined || k.attachedTo !== row.entityId || next.attachedTo !== row.entityId) return null;
              if (spanKindAt(timeline, row.entityId as PlayerId, (k.t + next.t) / 2) !== 'dribble') return null;

              return (
                <TrackBar
                  key={`${k.t}-dribble`}
                  testId={`dribble-${k.t}`}
                  left={leftPx(k.t, pxPerCell)}
                  width={spanPx(k.t, next.t, pxPerCell)}
                  top="25%"
                  height="50%"
                  background={DRIBBLE_BACKGROUND}
                  messageClearPx={xOfTime(TIME_GRID_S, pxPerCell) + MARKER_CAPTION_GAP_PX}
                  message={t('play.timeline.dribble', 'Dribble')}
                />
              );
            })}
          {row.keyframes.map((k, index) => {
            const selected =
              selection?.kind === 'keyframe' && selection.entityId === row.entityId && selection.t === k.t;
            const hollow = isBall && k.attachedTo === undefined;
            // A child branch's anchors include its ancestors' keyframes and the synthesised one at
            // its fork instant. They are not in this branch's own track, so there is nothing here
            // to retime: the marker is shown but, like the pre-fork part of the court, is locked.
            const owned = ownTrack.some((own) => own.t === k.t);

            return (
              <TimeMarker
                // Keyed by position, not by time: a retime changes `k.t`, and a key change would
                // remount the button and drop the focus the keyboard nudge needs to keep. The
                // constraints forbid a keyframe crossing its neighbour, so the order never moves.
                key={index}
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
                      // The block's left edge is its time, not its middle: measuring the grab from
                      // the middle would shift it half a cell on the first move.
                      anchor: 'start',
                      resolve: (rawT, snap) =>
                        constrainRetime(
                          play,
                          branchId,
                          row.entityId,
                          k.t,
                          rawT,
                          timeline.steps,
                          snap ? snapRadiusSeconds(pxPerCell) : 0,
                        ),
                      place: (element, value) => {
                        element.style.left = leftPx(value, pxPerCell);
                      },
                      restore: (element) => {
                        element.style.left = leftPx(k.t, pxPerCell);
                      },
                      commit: (value) => {
                        moveKeyframe(branchId, row.entityId, k.t, value);
                        onKeyframeRetimed(row.entityId, k.t, value);
                      },
                    })
                  : {})}
                selected={selected}
                style={{
                  position: 'absolute',
                  zIndex: 10,
                  top: '50%',
                  left: leftPx(k.t, pxPerCell),
                  touchAction: owned ? 'none' : undefined,
                  // The cell that begins at its time, so the block fills the interval the keyframe
                  // occupies on the grid, from its line to the next, at every zoom.
                  width: cellPx(pxPerCell),
                  cursor: owned ? 'grab' : 'pointer',
                  transform: 'translateY(-50%)',
                }}
              />
            );
          })}
        </Box>
      </TimeWindow>
      {!isBall && (
        <RenamePlayer
          key={`rename-${renaming.count}`}
          opened={renaming.opened}
          current={row.label ?? ''}
          // The name WITHOUT the one the coach gave: the placeholder says what clearing the
          // field gives back, so passing `rowName` showed them their own name as the thing
          // they would fall back to.
          fallback={entityName({ ...row, label: undefined }, t)}
          onRename={(label) => renamePlayer(row.entityId as PlayerId, label)}
          onClose={() => setRenaming((r) => ({ ...r, opened: false }))}
        />
      )}
      {!isBall && (
        <ConfirmDelete
          key={`player-${removingPlayer.count}`}
          opened={removingPlayer.opened}
          title={t('play.editor.removePlayerTitle', 'Remove player {{label}}?', { label: rowName })}
          body={t(
            'play.editor.removePlayerBody',
            'Player {{label}} will be removed from every branch, together with every screen they are part of.',
            { label: rowName },
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
          screener: removingScreen === undefined ? '' : nameOfPlayer(removingScreen.screenerId),
          beneficiary: removingScreen === undefined ? '' : nameOfPlayer(removingScreen.beneficiaryId),
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
