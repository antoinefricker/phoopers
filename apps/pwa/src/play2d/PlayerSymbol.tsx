import type { Player } from '../engine';

// The token geometry, in court metres, shared by the court and by the timeline's gutter so one
// definition governs both. A change of shape or shade reaches every surface at once.
export const TOKEN_SIZE = 0.9;

// The defence square is sized by equal AREA, not equal width: at an equal footprint a rotated
// square covers only 64% of the disc, which reads as a smaller player. Matching the area gives
// both teams the same visual weight and costs 25% more width — the square spans 1.13 m against
// the disc's 0.9 m. Derived rather than typed so the relationship survives a size change.
export const DIAMOND_SIDE = (TOKEN_SIZE / 2) * Math.sqrt(Math.PI);

// The widest a token reaches from its centre, which is the square's half-diagonal rather than
// the disc's radius. A wrapper sizes its viewBox from this so nothing is clipped.
export const TOKEN_REACH = (DIAMOND_SIDE * Math.SQRT2) / 2;

export const BALL_RADIUS = 0.18;

// A held ball is drawn down and to the right of its carrier instead of dead centre, where the
// token's own symbol would swallow it and hide the player's number. The offset puts the ball's
// centre on the offense disc's rim — half overlapping, which reads as held rather than parked
// beside. Derived from the token so it follows a size change.
// A defender's diamond points this way, its corner reaching 0.564, so the ball sits deeper
// inside that symbol than inside a disc.
export const HELD_BALL_OFFSET = TOKEN_SIZE / 2 / Math.SQRT2;

interface Props {
  team: Player['team'];
  label: string;
}

// Centred on the origin, in court metres, with no transform of its own: the caller places it.
export function PlayerSymbol({ team, label }: Props) {
  return (
    <>
      {/* Offense is a disc, defense a rotated square, and the two differ in luminance as well
          as in shape — the roadmap justifies SVG by printable handouts, and a greyscale print
          renders blue-6 at 0.25 against red-1 at 0.82, so the teams stay apart with neither
          colour nor shape alone carrying the whole load. */}
      {team === 'offense' ? (
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
        fill={team === 'offense' ? 'var(--mantine-color-white)' : 'var(--mantine-color-red-9)'}
        dy={0}
      >
        {label}
      </text>
    </>
  );
}

// A standalone badge for anywhere outside the court's own SVG — the timeline's gutter draws the
// same token the court does, at row height, rather than restating it as text.
export function PlayerSymbolBadge({ team, label, sizePx, name }: Props & { sizePx: number; name: string }) {
  const box = TOKEN_REACH * 2;

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`${-TOKEN_REACH} ${-TOKEN_REACH} ${box} ${box}`}
      role="img"
      aria-label={name}
      style={{ flexShrink: 0 }}
    >
      <PlayerSymbol team={team} label={label} />
    </svg>
  );
}

// The ball has no number, so it is its own badge rather than a case inside PlayerSymbol.
export function BallSymbolBadge({ sizePx, name }: { sizePx: number; name: string }) {
  const box = TOKEN_REACH * 2;

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`${-TOKEN_REACH} ${-TOKEN_REACH} ${box} ${box}`}
      role="img"
      aria-label={name}
      style={{ flexShrink: 0 }}
    >
      <circle r={BALL_RADIUS} fill="var(--mantine-color-orange-6)" />
    </svg>
  );
}
