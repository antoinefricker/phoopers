// Where the timeline's view should sit, for the three things that move it: the playhead
// advancing while the play runs, a zoom, and a pointer dragging at the window's edge. These are
// pure pixel rules: they take the current box and a position, and return a scroll offset. They
// know nothing of time, React or the DOM, so each one can be tested without a browser.
//
// Two origins are in play and the names keep them apart. A playhead position is measured from
// the content's left edge (the start of the timeline), because that is where the playhead lives.
// A pointer offset is measured from the window's left edge, because that is where the pointer
// lives. Mixing them silently moves the view by the scroll offset, so do not pass one for the
// other.
//
// Every function returns an offset already passed through `clampScroll`, so a caller never has
// to clamp again. The three rules are independent: none calls another except through
// `clampScroll`.

export interface ViewportBox {
  // The current horizontal scroll offset of the window.
  scrollLeft: number;
  // The visible width of the window.
  viewportWidthPx: number;
  // The width of the scrollable content inside the window.
  contentWidthPx: number;
}

// The playhead is carried only once it leaves the middle 80 % of the window. Inside that band
// the view stays still, so it does not twitch on every frame; carrying it at the very edges
// would leave the coach no room to see what is coming.
export const FOLLOW_BAND_MIN = 0.1;
export const FOLLOW_BAND_MAX = 0.9;

// A pointer within this many pixels of either edge of the window pulls the view along. It is a
// fixed step per call rather than a speed, so the drag keeps its direction without a timer.
export const EDGE_SCROLL_PX = 24;

// A non-finite input has no position to act on. It reads as zero so the arithmetic below stays
// finite, which is what the callers feed into a scroll position.
function finite(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function maxScroll(box: ViewportBox): number {
  return Math.max(0, finite(box.contentWidthPx) - finite(box.viewportWidthPx));
}

/**
 * The offset clamped to the range the content allows.
 *
 * It stops at both ends. A play narrower than the window has nowhere to scroll, so the only
 * offset is zero.
 */
export function clampScroll(scrollLeft: number, box: ViewportBox): number {
  const offset = finite(scrollLeft);

  return Math.min(Math.max(offset, 0), maxScroll(box));
}

/**
 * The offset that keeps the playhead inside the follow band while the play runs.
 *
 * Inside the band the view is left where it is. Past either edge of the band the view moves
 * just far enough to return the playhead to that edge, so a play running forwards and one
 * running backwards are both carried.
 */
export function scrollToFollow(playheadX: number, box: ViewportBox): number {
  const current = clampScroll(box.scrollLeft, box);

  if (!Number.isFinite(playheadX)) return current;

  const viewport = finite(box.viewportWidthPx);
  const minEdge = viewport * FOLLOW_BAND_MIN;
  const maxEdge = viewport * FOLLOW_BAND_MAX;
  // Where the playhead sits in the window right now, from the window's left edge.
  const inWindow = playheadX - finite(box.scrollLeft);

  if (inWindow > maxEdge) return clampScroll(playheadX - maxEdge, box);
  if (inWindow < minEdge) return clampScroll(playheadX - minEdge, box);

  return current;
}

/**
 * The offset after a zoom that keeps the playhead where it was in the window.
 *
 * The playhead keeps the same fraction across the window, so zooming does not jump it out of
 * view. A playhead that was already out of sight has no fraction worth keeping, so it is
 * centred instead. A window of no width has no fraction either, so it is centred too.
 */
export function scrollAroundZoom(playheadXBefore: number, playheadXAfter: number, box: ViewportBox): number {
  const current = clampScroll(box.scrollLeft, box);

  if (!Number.isFinite(playheadXBefore) || !Number.isFinite(playheadXAfter)) return current;

  const viewport = finite(box.viewportWidthPx);
  // Where the playhead sat in the window before the zoom, from the window's left edge.
  const inWindow = playheadXBefore - finite(box.scrollLeft);
  const outOfSight = viewport <= 0 || inWindow < 0 || inWindow > viewport;

  // Keeping the same pixel offset inside the window is the same as keeping the same fraction,
  // since the window's width does not change with the zoom.
  const offsetInWindow = outOfSight ? viewport / 2 : inWindow;

  return clampScroll(playheadXAfter - offsetInWindow, box);
}

/**
 * The offset while the pointer drags at the window's edge.
 *
 * Within `EDGE_SCROLL_PX` of the left edge the view moves one step back; within the same
 * distance of the right edge it moves one step forward. A pointer past the window counts as
 * being in the nearer zone, so dragging out of the window keeps scrolling the same way instead
 * of reversing. A window narrower than two edge zones has both zones overlapping; the nearer
 * half decides.
 */
export function scrollForEdgeDrag(pointerOffsetX: number, box: ViewportBox): number {
  const current = clampScroll(box.scrollLeft, box);

  if (!Number.isFinite(pointerOffsetX)) return current;

  const viewport = finite(box.viewportWidthPx);

  if (pointerOffsetX >= EDGE_SCROLL_PX && pointerOffsetX <= viewport - EDGE_SCROLL_PX) {
    return current;
  }

  const step = pointerOffsetX < viewport / 2 ? -EDGE_SCROLL_PX : EDGE_SCROLL_PX;

  return clampScroll(finite(box.scrollLeft) + step, box);
}
