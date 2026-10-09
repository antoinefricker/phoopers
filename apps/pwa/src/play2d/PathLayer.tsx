import { useMemo } from 'react';
import { usePlaybackContext } from './usePlaybackContext';
import { ballPathSegments, dribblePathD, playerPathSegments } from './geometry/paths';
import { DRIBBLE_AMPLITUDE, DRIBBLE_WAVELENGTH } from './pathSymbols';

/**
 * Static: reads only the stable playback context, so it never re-renders while time advances.
 * Takes no court-view props, so toggling half court cannot alter any geometry here. The path
 * strings are memoised on the timeline, so play and pause (which re-render this component via
 * the stable context) cost nothing; only a new resolved timeline recomputes them.
 */
export function PathLayer() {
  const { timeline } = usePlaybackContext();

  const { players, pass } = useMemo(() => {
    const players = timeline.players.map((player) => {
      const spans = timeline.spans[player.id] ?? [];
      const segments = playerPathSegments(timeline, player.id).flatMap((segment, index) => {
        const span = spans[index];
        // A standing-still span has no direction to point an arrow in; it has no symbol.
        if (segment.kind === 'idle' || span === undefined) {
          return [];
        }
        const d = segment.kind === 'dribble' ? dribblePathD(span, DRIBBLE_AMPLITUDE, DRIBBLE_WAVELENGTH) : segment.d;
        // A zero-length dribble has nothing to draw.
        return d === '' ? [] : [{ key: `${player.id}-${index}`, kind: segment.kind, d }];
      });
      return { id: player.id, team: player.team, segments };
    });

    // A held ball rides its carrier, so drawing it would paint over the carrier's own symbol
    // (hiding a dribble's wave). Only the pass is a ball symbol.
    const pass = ballPathSegments(timeline).filter((segment) => segment.inFlight);

    return { players, pass };
  }, [timeline]);

  return (
    <g fill="none" strokeWidth={0.08} strokeLinecap="round" strokeLinejoin="round">
      {players.map((player) => (
        <g
          key={player.id}
          data-testid="player-path"
          stroke={player.team === 'offense' ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-red-6)'}
        >
          {player.segments.map((segment) => (
            <path key={segment.key} data-kind={segment.kind} d={segment.d} markerEnd="url(#arrowhead)" />
          ))}
        </g>
      ))}
      {pass.map((segment, index) => (
        <path
          key={`ball-${index}`}
          data-testid="ball-path"
          d={segment.d}
          stroke="var(--mantine-color-orange-6)"
          strokeDasharray="0.3 0.2"
          markerEnd="url(#arrowhead)"
        />
      ))}
    </g>
  );
}
