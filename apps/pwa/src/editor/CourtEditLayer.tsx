import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityId, Player, PlayerId } from '../engine';
import { ballCarryAt, stateAt } from '../engine';
import { DIAMOND_SIDE, HELD_BALL_OFFSET, TOKEN_SIZE } from '../play2d/PlayerSymbol';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { snapToGrid } from '../play2d/transportMath';
import { debugFlag } from './debugFlags';
import { entityName } from './entityName';
import { forkTimeOf } from './mutations';
import { DRAG_SLOP_PX } from './useTimeDrag';
import { courtPointFromEvent, dropTargetAt } from './pointer';
import { useEditorContext } from './useEditorContext';

/** Court metres: a little over a token's own radius, so a drop that visually lands on a player attaches. */
export const BALL_SNAP_RADIUS = 1.2;

// A player's reactive area is its drawn symbol (see `HitShape`), so this radius only sizes the
// drag ghost, which marks where the token will land.
const PLAYER_GHOST_RADIUS = 0.7;
// A little over the drawn ball's own radius (0.18), so it is easy to grab; a held ball sits half
// over its carrier, and anything much wider covers the carrier and makes it hard to select.
const BALL_HIT_RADIUS = 0.3;

/** The symbol a hit target takes the outline of: a disc, a square turned 45° or the ball's disc. */
type HitShape = Player['team'] | 'ball';

const translate = (x: number, y: number): string => `translate(${x} ${y})`;

/**
 * The edit layer: one transparent hit target per entity, laid over the 1b token layer, and a ghost
 * that follows the pointer. A gesture commits once, on release. Pointer moves only write an
 * attribute on the ghost, because every commit re-resolves the branch and rebuilds each span's
 * arc-length table.
 */
export function CourtEditLayer() {
  const { t } = useTranslation();
  const { play, selection, select, placingScreen, setPlacingScreen, setKeyframe, attachBall, releaseBall, addScreen } =
    useEditorContext();
  const { timeline, branchId, currentTimeRef, subscribe } = usePlaybackContext();
  const layerRef = useRef<SVGGElement | null>(null);
  const ghostRef = useRef<SVGGElement | null>(null);
  const ghostCircleRef = useRef<SVGCircleElement | null>(null);
  // The in-flight gesture. A ref, not state: it changes per pointer move and must not render.
  // `moved` flips once the pointer leaves the slop circle: until then it is a click, which selects
  // and writes nothing.
  const dragRef = useRef<{ entityId: EntityId; startX: number; startY: number; moved: boolean } | null>(null);
  // Which hit target the pointer is over. State, unlike the drag: it changes only when the
  // pointer crosses a target's edge, and the layer's transforms are written to the nodes, not
  // through props, so a render does not move anything.
  const [hovered, setHovered] = useState<EntityId | null>(null);

  const hitPlayers = timeline.players.filter((player) => (timeline.anchors[player.id]?.length ?? 0) > 0);
  const hasBall = (timeline.anchors['ball']?.length ?? 0) > 0;

  // Keep each hit target on its token as the clock runs, exactly as the 1b token layer does.
  useLayoutEffect(() => {
    // The hit targets are exactly the layer's [data-entity] children, and they only change with
    // the timeline, so they are collected once per effect rather than once per frame.
    const nodes = Array.from(layerRef.current?.querySelectorAll<SVGGElement>('[data-entity]') ?? []);
    const paint = (time: number) => {
      const state = stateAt(timeline, time);

      for (const node of nodes) {
        const id = node.dataset['entity'] as EntityId;
        const position = id === 'ball' ? state.ball.position : state.players[id]?.position;
        if (position !== undefined) {
          // The ball's target follows the ball as drawn, offset into its carrier's hands, not
          // the carrier's centre, which belongs to the player's own target.
          const held = id === 'ball' ? HELD_BALL_OFFSET * ballCarryAt(timeline, time) : 0;
          node.setAttribute('transform', translate(position.x + held, position.y + held));
        }
      }
    };

    paint(currentTimeRef.current);
    return subscribe(paint);
  }, [timeline, subscribe, currentTimeRef]);

  const pointOf = (event: React.PointerEvent) =>
    courtPointFromEvent(event, layerRef.current?.ownerSVGElement ?? null, play);

  const hideGhost = () => ghostRef.current?.setAttribute('visibility', 'hidden');

  const onPointerDown = (event: React.PointerEvent<SVGGElement>) => {
    const entityId = event.currentTarget.dataset['entity'] as EntityId;

    // Choosing the beneficiary of a screen: the click is the gesture, not the start of a drag.
    // The mutation owns the rules (no self-screen, no unknown player, nothing before the fork).
    if (placingScreen) {
      if (selection !== null && selection.entityId !== 'ball' && entityId !== 'ball') {
        addScreen(branchId, snapToGrid(currentTimeRef.current), selection.entityId as PlayerId, entityId as PlayerId);
      }
      setPlacingScreen(false);
      return;
    }

    // Selecting is not a write, so it is not subject to the fork rule below.
    select({ kind: 'entity', entityId });
    // Presentation half of the fork rule. The mutation refuses the same write independently.
    if (currentTimeRef.current < forkTimeOf(play, branchId)) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { entityId, startX: event.clientX, startY: event.clientY, moved: false };
    ghostCircleRef.current?.setAttribute('r', String(entityId === 'ball' ? BALL_HIT_RADIUS : PLAYER_GHOST_RADIUS));
    const point = pointOf(event);
    ghostRef.current?.setAttribute('transform', translate(point.x, point.y));
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag === null) return;
    // Both axes: the court is two-dimensional.
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > DRAG_SLOP_PX) {
      drag.moved = true;
      ghostRef.current?.setAttribute('visibility', 'visible');
    }
    if (!drag.moved) return;

    const point = pointOf(event);
    ghostRef.current?.setAttribute('transform', translate(point.x, point.y));
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    hideGhost();
    if (drag === null || !drag.moved) return;

    // The clock is continuous while a play runs, so a keyframe dropped mid-playback would sit
    // between two cells. The drop target is still read at the TRUE time: the ball lands on the
    // player it was actually dropped on, not on whoever is nearest half a second away.
    const time = snapToGrid(currentTimeRef.current);
    const point = pointOf(event);

    if (drag.entityId === 'ball') {
      // Two outcomes: onto a player it is attached to them, onto open court it is released.
      const target = dropTargetAt(timeline, currentTimeRef.current, point, BALL_SNAP_RADIUS);
      if (target === null) releaseBall(branchId, time, point);
      else attachBall(branchId, time, target);
      return;
    }

    setKeyframe(branchId, drag.entityId, time, point);
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    hideGhost();
  };

  const hitTarget = (entityId: EntityId, shape: HitShape, label: string) => {
    // Transparent, not `none`, so the fill still takes pointer events. The stroke is the hover
    // outline, in the ghost's own style, so a coach can see where a press lands without the
    // court carrying a ring per token.
    const area = {
      fill: 'transparent',
      stroke: hovered === entityId && debugFlag('showHitAreas') ? 'var(--mantine-primary-color-filled)' : 'none',
      strokeWidth: 0.05,
      strokeDasharray: '0.2 0.15',
    };

    return (
      <g
        key={entityId}
        data-testid={`edit-token-${entityId}`}
        data-entity={entityId}
        aria-label={label}
        style={{ cursor: 'grab', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={() => setHovered(entityId)}
        onPointerLeave={() => setHovered((current) => (current === entityId ? null : current))}
      >
        {shape === 'defense' ? (
          <rect
            width={DIAMOND_SIDE}
            height={DIAMOND_SIDE}
            x={-DIAMOND_SIDE / 2}
            y={-DIAMOND_SIDE / 2}
            transform="rotate(45)"
            {...area}
          />
        ) : (
          <circle r={shape === 'ball' ? BALL_HIT_RADIUS : TOKEN_SIZE / 2} {...area} />
        )}
      </g>
    );
  };

  return (
    <g ref={layerRef} data-testid="edit-layer">
      {hitPlayers.map((player) =>
        hitTarget(
          player.id as PlayerId,
          player.team,
          t('play.editor.dragPlayer', 'Move player {{label}}', { label: entityName(player, t) }),
        ),
      )}
      {hasBall && hitTarget('ball', 'ball', t('play.editor.dragBall', 'Move the ball'))}
      <g ref={ghostRef} data-testid="edit-ghost" visibility="hidden" pointerEvents="none">
        <circle
          ref={ghostCircleRef}
          r={PLAYER_GHOST_RADIUS}
          fill="none"
          stroke="var(--mantine-primary-color-filled)"
          strokeWidth={0.1}
          strokeDasharray="0.3 0.2"
        />
      </g>
    </g>
  );
}
