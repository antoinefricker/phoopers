import { describe, expect, it } from 'vitest';
import type { CourtChoice } from './bounds';
import { courtBounds, displayedCentre } from './bounds';

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
