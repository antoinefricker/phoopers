import { IconBallBasketball } from '@tabler/icons-react';
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

// What every gutter badge frames. The square's half-diagonal is the widest any token reaches,
// so framing on it lets the square touch the badge's corners and leaves the disc at 80% — the
// ratio that makes their areas equal, as on the court.
const BADGE_REACH = TOKEN_REACH;

// Larger than a real ball against these tokens — a true 0.12 m radius would be a speck beside
// a 0.9 m player — and sized so the basketball's seams have room to read rather than to scale.
export const BALL_RADIUS = 0.22;

// A white rim around every token. On the wood floor the fills lose most of their contrast —
// measured 1.2:1 for the blue disc, 1.3:1 for the red square and 1.7:1 for the ball, against
// 3.3-3.6:1 on the white court they replaced. The rim separates each token from the floor by
// shape rather than by hue, the way a printed basketball diagram does.
const TOKEN_RIM = 0.06;

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
      {/* SHAPE alone separates the teams: blue-6 and red-6 sit at 0.245 and 0.270 luminance,
          1.08:1 apart, so a greyscale handout — the printable export the stack was chosen for
          — renders them the same grey. The disc and the rotated square are what survive it.
          Measured trade against the earlier light fill: the defender's silhouette rises from
          1.21:1 to 3.28:1 against the white court, clearing the 3:1 floor for a meaningful
          graphic, while its number falls from 4.51:1 to 3.28:1 — the same footing as the
          offense's white on blue at 3.56:1, and under the 4.5:1 AA floor for both. */}
      {team === 'offense' ? (
        <circle
          r={TOKEN_SIZE / 2}
          fill="var(--mantine-color-blue-6)"
          stroke="var(--mantine-color-white)"
          strokeWidth={TOKEN_RIM}
        />
      ) : (
        <rect
          width={DIAMOND_SIDE}
          height={DIAMOND_SIDE}
          x={-DIAMOND_SIDE / 2}
          y={-DIAMOND_SIDE / 2}
          fill="var(--mantine-color-red-6)"
          stroke="var(--mantine-color-white)"
          strokeWidth={TOKEN_RIM}
          transform="rotate(45)"
        />
      )}

      <text textAnchor="middle" dominantBaseline="central" fontSize={0.5} fill="var(--mantine-color-white)" dy={0}>
        {label}
      </text>
    </>
  );
}

// A standalone badge for anywhere outside the court's own SVG — the timeline's gutter draws the
// same token the court does, at row height, rather than restating it as text.
export function PlayerSymbolBadge({ team, label, sizePx, name }: Props & { sizePx: number; name: string }) {
  // Every badge is framed on the same reach — the square's half-diagonal — so the two symbols
  // keep the court's equal-AREA relationship instead of an equal box. A square and a disc
  // cannot both fill a 24px badge and cover the same surface: the square's diagonal is the
  // binding dimension, so it reaches the badge's corners while the disc spans 80% of it.
  const box = BADGE_REACH * 2;

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`${-BADGE_REACH} ${-BADGE_REACH} ${box} ${box}`}
      role="img"
      aria-label={name}
      style={{ flexShrink: 0 }}
    >
      <PlayerSymbol team={team} label={label} />
    </svg>
  );
}

// The seams are drawn at a constant one device pixel rather than in court metres, so they stay
// a hairline whatever the court's scale. `vector-effect` is NOT inherited — measured: set on
// the parent svg, a child path still computes `none` — and Tabler renders paths this component
// cannot reach through props, so the rule is carried by a <style> element inside the symbol.
const BALL_SEAM_CLASS = 'ball-seams';
const BALL_SEAM_RULE = `.${BALL_SEAM_CLASS} path { vector-effect: non-scaling-stroke; }`;
const BALL_STROKE = 1;

// Centred on the origin, in court metres, like PlayerSymbol. The filled disc carries the shape
// at any size — on the court the ball is about 7px across, where the icon's seams fall below a
// pixel — and the white icon over it adds the detail wherever there is room for it.
export function BallSymbol() {
  return (
    <>
      <circle
        r={BALL_RADIUS}
        fill="var(--mantine-color-orange-6)"
        stroke="var(--mantine-color-white)"
        strokeWidth={TOKEN_RIM}
      />
      <style>{BALL_SEAM_RULE}</style>
      <IconBallBasketball
        className={BALL_SEAM_CLASS}
        size={BALL_RADIUS * 2}
        stroke={BALL_STROKE}
        color="var(--mantine-color-white)"
        x={-BALL_RADIUS}
        y={-BALL_RADIUS}
      />
    </>
  );
}

// The ball has no number, so it is its own badge rather than a case inside PlayerSymbol.
export function BallSymbolBadge({ sizePx, name }: { sizePx: number; name: string }) {
  // The ball is a disc too, so it is drawn at the offense disc's size rather than its own: a
  // ball larger than a player would read as the bigger object. Its court proportion — a speck
  // beside a token — stays true where it means something, on the floor.
  const scale = TOKEN_SIZE / 2 / BALL_RADIUS;
  const box = BADGE_REACH * 2;

  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox={`${-BADGE_REACH} ${-BADGE_REACH} ${box} ${box}`}
      role="img"
      aria-label={name}
      style={{ flexShrink: 0 }}
    >
      <g transform={`scale(${scale})`}>
        <BallSymbol />
      </g>
    </svg>
  );
}
