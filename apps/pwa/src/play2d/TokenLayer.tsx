import { useLayoutEffect, useRef } from 'react';
import { stateAt } from '../engine';
import type { PlayerId } from '../engine';
import { usePlaybackContext } from './usePlaybackContext';

const translate = (x: number, y: number): string => `translate(${x} ${y})`;

// The offense disc's diameter, in court metres.
const TOKEN_SIZE = 0.9;
// The defence square is sized by equal AREA, not equal width: at an equal footprint a rotated
// square covers only 64% of the disc, which reads as a smaller player. Matching the area gives
// both teams the same visual weight and costs 25% more width — the square spans 1.13 m against
// the disc's 0.9 m. Derived rather than typed so the relationship survives a size change.
const DIAMOND_SIDE = (TOKEN_SIZE / 2) * Math.sqrt(Math.PI);

/**
 * The animated layer: player tokens and the ball. It does not re-render as time advances (only when the
 * stable context changes: a branch switch, or play, pause and end of play via `isPlaying`, which is
 * harmless because transforms are ref-owned).
 * It subscribes to the clock and writes `transform` straight onto the SVG nodes, so a
 * position never passes through React state or props.
 */
export function TokenLayer() {
  const { timeline, subscribe, currentTimeRef } = usePlaybackContext();
  const playerRefs = useRef(new Map<PlayerId, SVGGElement>());
  const ballRef = useRef<SVGGElement | null>(null);

  // A player with no keyframes in this branch has no position: a missing track is absent
  // from the sampler and an empty one samples to the court origin (spec 001). Either way
  // drawing a token would put a phantom player at the corner, so none is drawn.
  const tokenPlayers = timeline.players.filter((player) => (timeline.anchors[player.id]?.length ?? 0) > 0);

  // The ball follows the same rule: no ball keyframes means the sampler returns the origin.
  const hasBall = (timeline.anchors['ball']?.length ?? 0) > 0;

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
        ballRef.current.setAttribute('transform', translate(state.ball.position.x, state.ball.position.y));
      }
    };

    paint(currentTimeRef.current);
    return subscribe(paint);
  }, [timeline, subscribe, currentTimeRef]);

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
          {/* Offense is a disc, defense a rotated square, and the two differ in luminance as
              well as in shape — the roadmap justifies SVG by printable handouts, and a
              greyscale print renders blue-6 at 0.25 against red-1 at 0.82, so the teams stay
              apart with neither colour nor shape alone carrying the whole load.
              The square is sized by equal area rather than equal width: a rotated square
              occupies its diagonal, so matching widths would leave it covering 64% of the
              disc and reading as the smaller player. */}
          {player.team === 'offense' ? (
            <circle r={TOKEN_SIZE / 2} fill="var(--mantine-color-blue-6)" />
          ) : (
            <rect
              width={DIAMOND_SIDE}
              height={DIAMOND_SIDE}
              x={-DIAMOND_SIDE / 2}
              y={-DIAMOND_SIDE / 2}
              fill="var(--mantine-color-red-1)"
              transform="rotate(45)"
            />
          )}
          {/* red-9 on red-1 measures 4.51:1, just over the 4.5:1 WCAG AA floor for normal text;
              red-8 would drop it to 3.73:1. */}
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={0.5}
            fill={player.team === 'offense' ? 'var(--mantine-color-white)' : 'var(--mantine-color-red-9)'}
            dy={0}
          >
            {player.label}
          </text>
        </g>
      ))}
      {hasBall && (
        <g data-testid="ball-token" ref={ballRef}>
          <circle r={0.18} fill="var(--mantine-color-orange-6)" />
        </g>
      )}
    </g>
  );
}
