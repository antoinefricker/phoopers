import { useLayoutEffect, useRef } from 'react';
import { stateAt } from '../engine';
import type { PlayerId } from '../engine';
import { usePlaybackContext } from './usePlaybackContext';

const translate = (x: number, y: number): string => `translate(${x} ${y})`;

/**
 * The animated layer: player tokens and the ball. It never re-renders as time advances.
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

  // Layout effect so the first paint already has every token in place, not at (0, 0).
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
          {player.team === 'offense' ? (
            <circle r={0.45} fill="var(--mantine-color-blue-6)" />
          ) : (
            <g stroke="var(--mantine-color-red-6)" strokeWidth={0.12} strokeLinecap="round">
              <line x1={-0.35} y1={-0.35} x2={0.35} y2={0.35} />
              <line x1={-0.35} y1={0.35} x2={0.35} y2={-0.35} />
            </g>
          )}
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={0.5}
            fill={player.team === 'offense' ? 'var(--mantine-color-white)' : 'var(--mantine-color-red-6)'}
            dy={player.team === 'offense' ? 0 : -0.7}
          >
            {player.label}
          </text>
        </g>
      ))}
      <g data-testid="ball-token" ref={ballRef}>
        <circle r={0.18} fill="var(--mantine-color-orange-6)" />
      </g>
    </g>
  );
}
