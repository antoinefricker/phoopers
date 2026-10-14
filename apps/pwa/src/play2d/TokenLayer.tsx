import { useContext, useLayoutEffect, useRef } from 'react';
import { ballCarryAt, stateAt } from '../engine';
import type { PlayerId } from '../engine';
import { usePlaybackContext } from './usePlaybackContext';
import { HiddenEntitiesContext, NOTHING_HIDDEN } from './useHiddenEntitiesContext';
import { BallSymbol, HELD_BALL_OFFSET, PlayerSymbol } from './PlayerSymbol';

const translate = (x: number, y: number): string => `translate(${x} ${y})`;

/**
 * The animated layer: player tokens and the ball. It does not re-render as time advances (only when the
 * stable context changes: a branch switch, or play, pause and end of play via `isPlaying`, which is
 * harmless because transforms are ref-owned).
 * It subscribes to the clock and writes `transform` straight onto the SVG nodes, so a
 * position never passes through React state or props.
 */
export function TokenLayer() {
  const { timeline, subscribe, currentTimeRef } = usePlaybackContext();
  // Read the context directly rather than through the hook: these layers still render without
  // a provider around them (the 1b tests do), and then nothing is hidden because nothing
  // offers to hide it. `PlayCanvas` reads `EditorContext` the same way, for the same reason.
  const hidden = useContext(HiddenEntitiesContext)?.hidden ?? NOTHING_HIDDEN;
  const playerRefs = useRef(new Map<PlayerId, SVGGElement>());
  const ballRef = useRef<SVGGElement | null>(null);

  // A player with no keyframes in this branch has no position: a missing track is absent
  // from the sampler and an empty one samples to the court origin (spec 001). Either way
  // drawing a token would put a phantom player at the corner, so none is drawn.
  const tokenPlayers = timeline.players.filter(
    (player) => (timeline.anchors[player.id]?.length ?? 0) > 0 && !hidden.has(player.id),
  );

  // The ball follows the same rule: no ball keyframes means the sampler returns the origin.
  const hasBall = (timeline.anchors['ball']?.length ?? 0) > 0 && !hidden.has('ball');

  // Layout effect so the first paint already has every token in place, not at (0, 0). The
  // guarantee is not testable in jsdom (act flushes effects before any assertion).
  useLayoutEffect(() => {
    const paint = (t: number) => {
      const state = stateAt(timeline, t);

      for (const [id, node] of playerRefs.current) {
        const position = state.players[id]?.position;
        if (position !== undefined) {
          node.setAttribute('transform', translate(position.x, position.y));
        }
      }

      if (ballRef.current !== null) {
        // Scaled by how far the ball is in a carrier's hands, not switched on `attachedTo`: the
        // boolean stepped the whole offset in at a catch and out at a release, teleporting the
        // ball by 0.45m on a frame where it had barely moved. The carry is spent to zero by the
        // end of a shot, so the ball still lands on its target rather than beside it.
        const held = HELD_BALL_OFFSET * ballCarryAt(timeline, t);
        ballRef.current.setAttribute(
          'transform',
          translate(state.ball.position.x + held, state.ball.position.y + held),
        );
      }
    };

    paint(currentTimeRef.current);

    return subscribe(paint);
    // `hidden` belongs here although `paint` never reads it: showing an entity again mounts a
    // fresh node, which carries no transform until something paints it. Without this the node
    // sat at the svg origin — the court's corner — until the clock next moved, which, paused,
    // it never does.
  }, [timeline, subscribe, currentTimeRef, hidden]);

  return (
    <g>
      {tokenPlayers.map((player) => (
        <g
          key={player.id}
          data-testid="token"
          data-player-id={player.id}
          ref={(node) => {
            if (node === null) {
              playerRefs.current.delete(player.id);
            } else {
              playerRefs.current.set(player.id, node);
            }
          }}
        >
          <PlayerSymbol team={player.team} label={player.label} />
        </g>
      ))}
      {hasBall && (
        <g data-testid="ball-token" ref={ballRef}>
          <BallSymbol />
        </g>
      )}
    </g>
  );
}
