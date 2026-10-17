import { describe, expect, it } from 'vitest';
import type { CourtChoice } from './bounds';
import { PLAYER_CLEARANCE, courtBounds, displayedCentre, freeSpot } from './bounds';

const fullCourt: CourtChoice = { court: 'fiba', extent: 'full' };
const halfCourt: CourtChoice = { court: 'fiba', extent: 'half' };

describe('courtBounds', () => {
  it('is the whole floor plus a metre on a full court', () => {
    expect(courtBounds(fullCourt)).toEqual({ minX: -1, maxX: 29, minY: -1, maxY: 16 });
  });

  it('starts a metre before the halfway line on a half court', () => {
    expect(courtBounds(halfCourt)).toEqual({ minX: 13, maxX: 29, minY: -1, maxY: 16 });
  });

  it('treats a play that declares no extent as a full court', () => {
    expect(courtBounds({ court: 'fiba' })).toEqual(courtBounds(fullCourt));
  });

  it('reads the NBA length rather than assuming FIBA', () => {
    expect(courtBounds({ court: 'nba', extent: 'half' }).minX).toBeCloseTo(13.325);
  });
});

describe('displayedCentre', () => {
  it('is the middle of the floor on a full court', () => {
    expect(displayedCentre(fullCourt)).toEqual({ x: 14, y: 7.5 });
  });

  it('is the middle of the shown half on a half court', () => {
    expect(displayedCentre(halfCourt)).toEqual({ x: 21, y: 7.5 });
  });
});

describe('freeSpot', () => {
  const centre = { x: 21, y: 7.5 };

  it('is the point asked for when nobody is standing there', () => {
    expect(freeSpot(halfCourt, centre, [{ x: 25, y: 3 }], PLAYER_CLEARANCE)).toEqual(centre);
  });

  it('steps away from the basket when someone is', () => {
    expect(freeSpot(halfCourt, centre, [centre], PLAYER_CLEARANCE)).toEqual({ x: 19, y: 7.5 });
  });

  it('keeps stepping while each spot it tries is taken too', () => {
    const crowd = [centre, { x: 19, y: 7.5 }, { x: 23, y: 7.5 }];

    expect(freeSpot(halfCourt, centre, crowd, PLAYER_CLEARANCE)).toEqual({ x: 17, y: 7.5 });
  });

  it('never steps outside the bounds', () => {
    // A half court is 16 m wide with the margin, so the fourth step would leave it.
    const column = [15, 17, 19, 21, 23, 25, 27].map((x) => ({ x, y: 7.5 }));
    const spot = freeSpot(halfCourt, centre, column, PLAYER_CLEARANCE);
    const { minX, maxX } = courtBounds(halfCourt);

    expect(spot.x).toBeGreaterThanOrEqual(minX);
    expect(spot.x).toBeLessThanOrEqual(maxX);
  });
});
