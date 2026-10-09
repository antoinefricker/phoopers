import { COURT_DIMENSIONS } from '../../engine';

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

export const fullCourtViewBox = (court: CourtType): string => {
  const spec = COURT_SPEC[court];
  return `0 0 ${spec.length} ${spec.width}`;
};

export const halfCourtViewBox = (court: CourtType): string => {
  const spec = COURT_SPEC[court];
  return `0 0 ${spec.length / 2} ${spec.width}`;
};
