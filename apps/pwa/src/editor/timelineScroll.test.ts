import { describe, expect, it } from 'vitest';
import {
  type ViewportBox,
  clampScroll,
  scrollAroundZoom,
  scrollForEdgeDrag,
  scrollToFollow,
  wheelDeltaPx,
} from './timelineScroll';

const box = (over: Partial<ViewportBox> = {}): ViewportBox => ({
  scrollLeft: 0,
  viewportWidthPx: 1000,
  contentWidthPx: 4320,
  ...over,
});

describe('clampScroll', () => {
  it('stops at both ends', () => {
    expect(clampScroll(-50, box())).toBe(0);
    expect(clampScroll(9999, box())).toBe(3320); // content - viewport
  });
  // Review Focus 1: nothing to scroll when the play fits.
  it('has nowhere to go when the play is narrower than the window', () => {
    expect(clampScroll(200, box({ contentWidthPx: 400 }))).toBe(0);
  });
  // Review Focus 4: jsdom and a collapsed panel both report zero.
  it('returns a finite offset for a window of no width', () => {
    expect(clampScroll(100, box({ viewportWidthPx: 0 }))).toBe(100);
    expect(clampScroll(100, box({ viewportWidthPx: 0, contentWidthPx: 0 }))).toBe(0);
  });
});

describe('scrollToFollow', () => {
  it('leaves the view alone inside the band', () => {
    expect(scrollToFollow(500, box())).toBe(0); // 50 % across
    expect(scrollToFollow(899, box())).toBe(0);
  });
  it('carries the playhead at the far edge of the band', () => {
    expect(scrollToFollow(950, box())).toBe(50); // back to 90 %
  });
  it('carries it at the near edge when the play runs backwards', () => {
    expect(scrollToFollow(150, box({ scrollLeft: 100 }))).toBe(50); // back to 10 %
  });
});

describe('scrollAroundZoom', () => {
  it('keeps the playhead the same fraction across the window', () => {
    // 30 % across before; the same 30 % after, at the new scale.
    expect(scrollAroundZoom(300, 600, box())).toBe(300);
  });
  // Review Focus 3: the clamp has the last word at either end.
  it('stops at the start rather than holding the fraction', () => {
    expect(scrollAroundZoom(100, 40, box())).toBe(0);
  });
  it('centres the playhead when it was out of sight', () => {
    expect(scrollAroundZoom(-200, 2000, box())).toBe(1500); // centred in 1000
  });
});

describe('scrollForEdgeDrag', () => {
  it('does nothing away from the edges', () => {
    expect(scrollForEdgeDrag(500, box({ scrollLeft: 100 }))).toBe(100);
  });
  it('pulls the view along at either edge', () => {
    expect(scrollForEdgeDrag(995, box({ scrollLeft: 100 }))).toBe(124);
    expect(scrollForEdgeDrag(5, box({ scrollLeft: 100 }))).toBe(76);
  });
  // Review Focus 5: past the edge keeps the direction rather than reversing.
  it('keeps scrolling when the pointer is beyond the window', () => {
    expect(scrollForEdgeDrag(1400, box({ scrollLeft: 100 }))).toBe(124);
    expect(scrollForEdgeDrag(-300, box({ scrollLeft: 100 }))).toBe(76);
  });
});

describe('the view rules on degenerate input', () => {
  it('returns a finite offset for non-finite pointer, playhead and box values', () => {
    const results = [
      clampScroll(Number.NaN, box()),
      scrollToFollow(Number.NaN, box({ scrollLeft: 100 })),
      scrollAroundZoom(Number.NaN, 300, box({ scrollLeft: 100 })),
      scrollAroundZoom(300, Number.POSITIVE_INFINITY, box({ scrollLeft: 100 })),
      scrollForEdgeDrag(Number.NaN, box({ scrollLeft: 100 })),
      scrollForEdgeDrag(500, box({ scrollLeft: Number.NaN })),
      scrollForEdgeDrag(500, box({ viewportWidthPx: Number.NaN })),
    ];

    for (const result of results) expect(Number.isFinite(result)).toBe(true);
  });
});

describe('wheelDeltaPx', () => {
  it('passes a pixel delta through', () => {
    expect(wheelDeltaPx(120, 0, 800)).toBe(120);
    expect(wheelDeltaPx(-30, 0, 800)).toBe(-30);
  });

  it('reads a line delta as forty pixels a line', () => {
    expect(wheelDeltaPx(3, 1, 800)).toBe(120);
  });

  it('reads a page delta as the width of the window', () => {
    expect(wheelDeltaPx(1, 2, 800)).toBe(800);
    expect(wheelDeltaPx(-1, 2, 800)).toBe(-800);
  });

  it('moves nothing for a delta that is not a number', () => {
    expect(wheelDeltaPx(Number.NaN, 0, 800)).toBe(0);
    expect(wheelDeltaPx(Number.POSITIVE_INFINITY, 1, 800)).toBe(0);
  });
});
