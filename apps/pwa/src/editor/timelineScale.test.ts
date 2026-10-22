import { describe, expect, it } from 'vitest';
import { ZOOM_LEVELS, contentWidthPx, pxPerSecond, timeAtX, xOfTime } from './timelineScale';

describe('the timeline scale', () => {
  it('runs from 24 px a cell outwards', () => {
    expect(ZOOM_LEVELS).toEqual([24, 18, 12, 6]);
  });
  it('turns a cell size into a speed', () => {
    expect(pxPerSecond(24)).toBe(240);
    expect(pxPerSecond(6)).toBe(60);
  });
  it('places a time at its distance from zero', () => {
    expect(xOfTime(2.5, 24)).toBe(600);
    expect(xOfTime(0, 24)).toBe(0);
  });
  it('reads a time back from a distance', () => {
    expect(timeAtX(600, 24)).toBeCloseTo(2.5, 9);
  });
  it('is as wide as the play is long', () => {
    expect(contentWidthPx(18, 24)).toBe(4320);
  });
  // Review Focus 2: a degenerate duration yields a width, never NaN.
  it('gives a zero width to a duration that is zero or not a number', () => {
    expect(contentWidthPx(0, 24)).toBe(0);
    expect(contentWidthPx(Number.NaN, 24)).toBe(0);
    expect(contentWidthPx(-3, 24)).toBe(0);
  });
  it('reads a non-finite distance as time zero', () => {
    expect(timeAtX(Number.NaN, 24)).toBe(0);
    expect(timeAtX(100, 0)).toBe(0);
  });
});
