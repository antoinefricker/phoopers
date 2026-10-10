import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityId, PlayerId } from '../engine';
import { stateAt } from '../engine';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { forkTimeOf } from './mutations';
import { courtPointFromEvent, dropTargetAt } from './pointer';
import { useEditorContext } from './useEditorContext';

/** Court metres: a little over a token's own radius, so a drop that visually lands on a player attaches. */
export const BALL_SNAP_RADIUS = 1.2;

const PLAYER_HIT_RADIUS = 0.7;
const BALL_HIT_RADIUS = 0.4;

const translate = (x: number, y: number): string => `translate(${x} ${y})`;

/**
 * The edit layer: one transparent hit target per entity, laid over the 1b token layer, and a ghost
 * that follows the pointer. A gesture commits once, on release. Pointer moves only write an
 * attribute on the ghost, because every commit re-resolves the branch and rebuilds each span's
 * arc-length table.
 */
export function CourtEditLayer() {
  const { t } = useTranslation();
  const { play, setKeyframe, attachBall, releaseBall } = useEditorContext();
  const { timeline, branchId, currentTimeRef, subscribe } = usePlaybackContext();
  const layerRef = useRef<SVGGElement | null>(null);
  const ghostRef = useRef<SVGGElement | null>(null);
  const ghostCircleRef = useRef<SVGCircleElement | null>(null);
  // The in-flight gesture. A ref, not state: it changes per pointer move and must not render.
  const dragRef = useRef<{ entityId: EntityId } | null>(null);

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
          node.setAttribute('transform', translate(position.x, position.y));
        }
      }
    };

    paint(currentTimeRef.current);
    return subscribe(paint);
  }, [timeline, subscribe, currentTimeRef]);

  const pointOf = (event: React.PointerEvent) =>
    courtPointFromEvent(event, layerRef.current?.ownerSVGElement ?? null, play.court);

  const hideGhost = () => ghostRef.current?.setAttribute('visibility', 'hidden');

  const onPointerDown = (event: React.PointerEvent<SVGGElement>) => {
    const entityId = event.currentTarget.dataset['entity'] as EntityId;
    // Presentation half of the fork rule. The mutation refuses the same write independently.
    if (currentTimeRef.current < forkTimeOf(play, branchId)) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { entityId };
    ghostCircleRef.current?.setAttribute('r', String(entityId === 'ball' ? BALL_HIT_RADIUS : PLAYER_HIT_RADIUS));
    const point = pointOf(event);
    ghostRef.current?.setAttribute('transform', translate(point.x, point.y));
    ghostRef.current?.setAttribute('visibility', 'visible');
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (dragRef.current === null) return;

    const point = pointOf(event);
    ghostRef.current?.setAttribute('transform', translate(point.x, point.y));
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    hideGhost();
    if (drag === null) return;

    const time = currentTimeRef.current;
    const point = pointOf(event);

    if (drag.entityId === 'ball') {
      // Two outcomes: onto a player it is attached to them, onto open court it is released.
      const target = dropTargetAt(timeline, time, point, BALL_SNAP_RADIUS);
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

  const hitTarget = (entityId: EntityId, radius: number, label: string) => (
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
    >
      <circle r={radius} fill="transparent" />
    </g>
  );

  return (
    <g ref={layerRef} data-testid="edit-layer">
      {hitPlayers.map((player) =>
        hitTarget(
          player.id as PlayerId,
          PLAYER_HIT_RADIUS,
          t('play.editor.dragPlayer', 'Move player {{label}}', { label: player.label }),
        ),
      )}
      {hasBall && hitTarget('ball', BALL_HIT_RADIUS, t('play.editor.dragBall', 'Move the ball'))}
      <g ref={ghostRef} data-testid="edit-ghost" visibility="hidden" pointerEvents="none">
        <circle
          ref={ghostCircleRef}
          r={PLAYER_HIT_RADIUS}
          fill="none"
          stroke="var(--mantine-color-yellow-6)"
          strokeWidth={0.1}
          strokeDasharray="0.3 0.2"
        />
      </g>
    </g>
  );
}
