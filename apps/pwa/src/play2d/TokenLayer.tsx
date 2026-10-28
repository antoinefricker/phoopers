import { useContext, useLayoutEffect, useRef } from 'react';
import { ballCarryAt, stateAt } from '../engine';
import type { PlayerId } from '../engine';
import { EditorContext } from '../editor/useEditorContext';
import { usePlaybackContext } from './usePlaybackContext';
import { HiddenEntitiesContext, NOTHING_HIDDEN } from './useHiddenEntitiesContext';
import { CourtTurnContext } from './useCourtTurnContext';
import { BallSymbol, HELD_BALL_OFFSET, PlayerSymbol } from './PlayerSymbol';

// Court metres, not CSS pixels: a filter length on an SVG element is in the element's user
// space, so the viewBox scales it with the court (measured at 24 px per metre: `2px 3px` became
// a ~73 px blur, a faint halo nobody saw as a shadow). The shadow now grows with the token.
const SELECTED_STYLE = { filter: 'drop-shadow(0 0.15px 0.12px rgba(0, 0, 0, 0.7))' };

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
  const selectedId = useContext(EditorContext)?.selection?.entityId;
  // A turned court is drawn through a rotated group, and every token is turned back inside it,
  // so what a token holds is upright on screen: its number reads, and its shadow falls down the
  // screen. The turn is undone on a wrapper rather than aimed for in the filter's offset, because
  // a drop shadow whose own space is rotated is drawn far from its token (measured: a 0.15 m
  // offset landed about 0.8 m away on a quarter-turned court).
  const turn = useContext(CourtTurnContext) ?? 0;
  const upright = turn === 0 ? undefined : `rotate(${-turn})`;
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
          // Which entity this node draws. The edit layer drains its colour while a copy is dragged,
          // by writing its filter, so this node carries no `style` of its own for React to
          // overwrite. The selection shadow is a filter too, but on the wrapper inside.
          data-token-of={player.id}
          data-selected={selectedId === player.id ? 'true' : undefined}
          ref={(node) => {
            if (node === null) {
              playerRefs.current.delete(player.id);
            } else {
              playerRefs.current.set(player.id, node);
            }
          }}
        >
          <g transform={upright} style={selectedId === player.id ? SELECTED_STYLE : undefined}>
            <PlayerSymbol team={player.team} number={player.number} />
          </g>
        </g>
      ))}
      {hasBall && (
        <g
          data-testid="ball-token"
          data-token-of="ball"
          data-selected={selectedId === 'ball' ? 'true' : undefined}
          ref={ballRef}
        >
          <g transform={upright} style={selectedId === 'ball' ? SELECTED_STYLE : undefined}>
            <BallSymbol />
          </g>
        </g>
      )}
    </g>
  );
}
