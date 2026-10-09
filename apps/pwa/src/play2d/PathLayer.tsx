import { pointOnCubic } from '../engine/curve';
import type { PreparedSpan } from '../engine';
import { usePlaybackContext } from './usePlaybackContext';
import { ballPathSegments, playerPathSegments, wavyPathD } from './geometry/paths';
import { DRIBBLE_AMPLITUDE, DRIBBLE_WAVELENGTH, SPAN_SAMPLES } from './pathSymbols';

/**
 * The span's cubic sampled into points. Sampled directly with `pointOnCubic` rather than
 * through the timeline: the span's control points are already real positions for players, and
 * a uniform parameter sweep needs no time mapping (the wiggle is resampled by arc length).
 */
function spanPoints(span: PreparedSpan) {
  return Array.from({ length: SPAN_SAMPLES + 1 }, (_, i) =>
    pointOnCubic(span.p0, span.p1, span.p2, span.p3, i / SPAN_SAMPLES),
  );
}

/**
 * Static: reads only the stable playback context, so it never re-renders while time advances.
 * Takes no court-view props, so toggling half court cannot alter any geometry here.
 */
export function PathLayer() {
  const { timeline } = usePlaybackContext();

  return (
    <g fill="none" strokeWidth={0.08} strokeLinecap="round" strokeLinejoin="round">
      {timeline.players.map((player) => {
        const spans = timeline.spans[player.id] ?? [];

        return (
          <g
            key={player.id}
            data-testid="player-path"
            stroke={player.team === 'offense' ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-red-6)'}
          >
            {playerPathSegments(timeline, player.id).map((segment, index) => {
              const span = spans[index];
              // A standing-still span has no direction to point an arrow in; it has no symbol.
              if (segment.kind === 'idle' || span === undefined) {
                return null;
              }

              const d =
                segment.kind === 'dribble'
                  ? wavyPathD(spanPoints(span), DRIBBLE_AMPLITUDE, DRIBBLE_WAVELENGTH)
                  : segment.d;

              return <path key={`${player.id}-${index}`} data-kind={segment.kind} d={d} markerEnd="url(#arrowhead)" />;
            })}
          </g>
        );
      })}
      {ballPathSegments(timeline)
        // A held ball rides its carrier, so drawing it would paint over the carrier's own
        // symbol (hiding a dribble's wave). Only the pass is a ball symbol.
        .filter((segment) => segment.inFlight)
        .map((segment, index) => (
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
