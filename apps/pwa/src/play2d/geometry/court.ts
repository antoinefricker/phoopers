import { COURT_DIMENSIONS, OUT_OF_BOUNDS_MARGIN } from '../../engine';
import { TOKEN_REACH } from '../PlayerSymbol';

export type CourtType = 'fiba' | 'nba';

export interface CourtSpec {
  length: number;
  width: number;
  /** Radius of the three-point arc, measured from the centre of the basket. */
  threePointRadius: number;
  /** Perpendicular distance from the basket's centre line to the straight corner three-point line. */
  threePointCorner: number;
  keyWidth: number;
  freeThrowFromBaseline: number;
  circleRadius: number;
  /** Distance from the baseline to the centre of the basket. */
  basketFromBaseline: number;
  /** Distance from the baseline to the face of the backboard. */
  backboardFromBaseline: number;
  backboardWidth: number;
  rimRadius: number;
}

const FEET = 0.3048;
const ft = (feet: number): number => feet * FEET;

// Dimensions checked against the FIBA Official Basketball Rules 2024 (Article 2 and
// Basketball Equipment) and the NBA Rule Book, Rule No. 1. NBA values are defined in
// feet and converted, because the NBA court is a feet-and-inches court.
export const COURT_SPEC: Record<CourtType, CourtSpec> = {
  fiba: {
    ...COURT_DIMENSIONS.fiba,
    threePointRadius: 6.75,
    // Corner lines sit 0.90 m inside the sideline: 15 / 2 - 0.90.
    threePointCorner: 6.6,
    keyWidth: 4.9,
    freeThrowFromBaseline: 5.8,
    circleRadius: 1.8,
    basketFromBaseline: 1.575,
    backboardFromBaseline: 1.2,
    backboardWidth: 1.8,
    rimRadius: 0.225,
  },
  nba: {
    ...COURT_DIMENSIONS.nba,
    threePointRadius: ft(23.75),
    // Corner lines sit 3 ft inside the sideline: 25 ft - 3 ft = 22 ft from the basket's centre line.
    threePointCorner: ft(22),
    keyWidth: ft(16),
    // 15 ft from the backboard face, which is 4 ft from the baseline.
    freeThrowFromBaseline: ft(19),
    circleRadius: ft(6),
    // Backboard face 4 ft out, plus 6 in to the ring and its 9 in radius.
    basketFromBaseline: ft(5.25),
    backboardFromBaseline: ft(4),
    backboardWidth: ft(6),
    rimRadius: ft(0.75),
  },
};

export type Marking =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'path'; d: string };

/** Markings for one end, mirrored by the caller. `side` is 1 for the left basket, -1 for the right. */
function endMarkings(spec: CourtSpec, side: 1 | -1): Marking[] {
  const baseline = side === 1 ? 0 : spec.length;
  const inward = (distance: number) => baseline + side * distance;
  const midY = spec.width / 2;
  const basketX = inward(spec.basketFromBaseline);
  const cornerY = spec.width / 2 - spec.threePointCorner;

  // Where the arc meets the straight corner lines.
  const dx = Math.sqrt(Math.max(0, spec.threePointRadius ** 2 - spec.threePointCorner ** 2));
  const breakX = inward(spec.basketFromBaseline + dx);

  return [
    // Key
    {
      kind: 'rect',
      x: Math.min(baseline, inward(spec.freeThrowFromBaseline)),
      y: midY - spec.keyWidth / 2,
      w: spec.freeThrowFromBaseline,
      h: spec.keyWidth,
    },
    // Free-throw circle
    { kind: 'circle', cx: inward(spec.freeThrowFromBaseline), cy: midY, r: spec.circleRadius },
    // Backboard
    {
      kind: 'line',
      x1: inward(spec.backboardFromBaseline),
      y1: midY - spec.backboardWidth / 2,
      x2: inward(spec.backboardFromBaseline),
      y2: midY + spec.backboardWidth / 2,
    },
    // Rim
    { kind: 'circle', cx: basketX, cy: midY, r: spec.rimRadius },
    // Three-point corner lines
    { kind: 'line', x1: baseline, y1: cornerY, x2: breakX, y2: cornerY },
    {
      kind: 'line',
      x1: baseline,
      y1: spec.width - cornerY,
      x2: breakX,
      y2: spec.width - cornerY,
    },
    // Three-point arc
    {
      kind: 'path',
      d:
        `M ${breakX} ${cornerY} ` +
        `A ${spec.threePointRadius} ${spec.threePointRadius} 0 0 ${side === 1 ? 1 : 0} ` +
        `${breakX} ${spec.width - cornerY}`,
    },
  ];
}

export function courtMarkings(court: CourtType): Marking[] {
  const spec = COURT_SPEC[court];

  return [
    { kind: 'rect', x: 0, y: 0, w: spec.length, h: spec.width },
    { kind: 'line', x1: spec.length / 2, y1: 0, x2: spec.length / 2, y2: spec.width },
    { kind: 'circle', cx: spec.length / 2, cy: spec.width / 2, r: spec.circleRadius },
    ...endMarkings(spec, 1),
    ...endMarkings(spec, -1),
  ];
}

export const LINE_WIDTH = 0.1;

// The floor runs past the playing surface, as a hall does. Two things need the room.
// The boundary line is centred on the court's edge, so without an apron half the sideline falls
// outside the frame and draws at half thickness. And a player may be placed a metre out of
// bounds, which is where a set starts — so the apron is that metre, shared with the editor's
// bounds through OUT_OF_BOUNDS_MARGIN, PLUS the half-width of the token standing out there.
// The metre alone would frame that player's centre and cut their symbol in half at the edge,
// which is the clipping the apron exists to prevent.
export const APRON = OUT_OF_BOUNDS_MARGIN + TOKEN_REACH;

export const fullCourtViewBox = (court: CourtType): string => {
  const spec = COURT_SPEC[court];
  return `${-APRON} ${-APRON} ${spec.length + APRON * 2} ${spec.width + APRON * 2}`;
};

export type CourtSide = 'left' | 'right';

/** A rectangle of the floor, in court metres. */
export interface CourtRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The half of the floor on `side`, apron included. Which half to show is the caller's call.
 *
 * The halfway cut carries the apron too, unlike the outer edges' reason for one: there is no
 * line to keep whole there, but a player may stand a metre the other side of it — a defender
 * dropping back out of a half-court set — and the frame has to show them.
 */
export const halfCourtRegion = (court: CourtType, side: CourtSide): CourtRegion => {
  const spec = COURT_SPEC[court];
  const half = spec.length / 2;

  return {
    x: side === 'left' ? -APRON : half - APRON,
    y: -APRON,
    width: half + APRON * 2,
    height: spec.width + APRON * 2,
  };
};

/**
 * Where the markings of the half on `side` are drawn: the half itself, and no further than the
 * halfway line. The floor runs on past it, into the apron, so that a token standing there is
 * shown; the markings do not, or a half court would carry the other half's centre circle and
 * sidelines into the margin. The cut sits half a line's width before the halfway line, so that
 * line, centred on the cut, still draws whole.
 */
export const halfCourtMarkingsRegion = (court: CourtType, side: CourtSide): CourtRegion => {
  const half = COURT_SPEC[court].length / 2;
  const floor = halfCourtRegion(court, side);
  const reach = half + APRON + LINE_WIDTH / 2;

  return { ...floor, x: side === 'left' ? -APRON : half - LINE_WIDTH / 2, width: reach };
};

/**
 * The quarter turn, in degrees, that puts a half court in landscape with its basket at the top.
 *
 * The right half has its basket at the right, so it turns anticlockwise, which takes court
 * `(x, y)` to screen `(y, -x)`; the left half's basket is at the left and it turns clockwise,
 * which takes `(x, y)` to `(-y, x)`. Either way the court's width runs across the screen and its
 * length up it, and the turn is a rotation, not a mirror, so left and right stay the players'.
 * The data never turns: this is how the half is drawn, not where anything is.
 */
export const halfCourtTurn = (side: CourtSide): number => (side === 'right' ? -90 : 90);

/** The frame of the half court on `side`, as it appears once turned by `halfCourtTurn`. */
export const halfCourtViewBox = (court: CourtType, side: CourtSide): string => {
  const { x, y, width, height } = halfCourtRegion(court, side);
  // The region's corners through the turn: its height becomes the frame's width and its width
  // the frame's height.
  return side === 'right' ? `${y} ${-(x + width)} ${height} ${width}` : `${-(y + height)} ${x} ${height} ${width}`;
};
