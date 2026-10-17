import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import { ROOT, fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { SCRUBBER_AXIS_PX, TRANSPORT_ROW_HEIGHT_PX } from '../play2d/transportMath';
import { gridTicks } from './timelineGeometry';
import { enterEditMode, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const px = (value: string) => Number(value.replace('px', ''));

// The duration is resolved from the branch, not stored on the play.
const DURATION = resolveBranch(fixturePlay, ROOT).duration;

const renderTimeline = async () => {
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();

  return screen.getByTestId('time-grid');
};

describe('the time grid behind the timeline', () => {
  it('draws one line per authoring cell of the play', async () => {
    const grid = await renderTimeline();
    const expected = gridTicks(DURATION);

    expect(expected.length).toBeGreaterThan(1);
    expect(within(grid).getAllByTestId(/^time-grid-(major|minor)$/)).toHaveLength(expected.length);
  });

  it('draws the whole seconds more strongly than the half-seconds', async () => {
    const grid = await renderTimeline();
    const [major] = within(grid).getAllByTestId('time-grid-major');
    const [minor] = within(grid).getAllByTestId('time-grid-minor');

    // One token at two strengths, so the pair follows the theme with nothing to tune twice.
    expect(major?.style.background).toBe(minor?.style.background);
    expect(Number(major?.style.opacity)).toBeGreaterThan(Number(minor?.style.opacity));
  });

  it('places each line at its share of the duration', async () => {
    const grid = await renderTimeline();
    const lines = within(grid).getAllByTestId(/^time-grid-(major|minor)$/);
    const lefts = lines.map((line) => line.style.left);

    expect(lefts[0]).toBe('0%');
    expect(lefts.at(-1)).toBe('100%');
  });

  it('ends where the playhead does, although it is measured from further out', async () => {
    // The two no longer share a parent: the playhead is inside the scroll viewport, which
    // already reserves the scrollbar's gutter, while the grid is outside it and has to reserve
    // that gutter itself. Their raw `right` therefore differ by exactly the gutter, and the
    // lines still land on the same x. Asserting them equal would pin the wrong thing.
    const grid = await renderTimeline();
    const playhead = screen.getByTestId('timeline-playhead').parentElement as HTMLElement;
    const viewport = screen.getByTestId('timeline-viewport');

    expect(grid.style.left).toBe(playhead.style.left);
    expect(px(grid.style.right)).toBe(px(viewport.style.paddingRight) + px(playhead.style.right));
  });

  it('starts its lines on the scrubber axis, derived from the transport own height', async () => {
    // The whole point of deriving it: the offset used to be a hand-tuned 12, which would have
    // drifted off the scrubber in silence the day the transport row or the thumb changed size.
    // Both sides are pinned here, so a change to one without the other fails rather than slips.
    const grid = await renderTimeline();
    const transport = screen.getByTestId('transport-row');
    const [line] = within(grid).getAllByTestId('time-grid-major');

    expect(transport).toHaveStyle({ height: `${TRANSPORT_ROW_HEIGHT_PX}px` });
    expect(px(line?.style.top ?? '')).toBe(TRANSPORT_ROW_HEIGHT_PX / 2);
    expect(px(line?.style.top ?? '')).toBe(SCRUBBER_AXIS_PX);
  });

  it('runs behind the transport and not only behind the rows', async () => {
    // The point of the change: a line that stopped at the step ruler left the scrubber above it
    // on an axis of its own. The grid is a sibling of the box holding BOTH, so it spans them.
    const grid = await renderTimeline();
    const transport = screen.getByTestId('transport-row');

    expect(grid.parentElement?.contains(transport)).toBe(true);
    // And outside the rows' scroll area, or it would be clipped back to them.
    expect(screen.getByTestId('timeline-viewport').contains(grid)).toBe(false);
  });

  it('stays out of the way: no pointer events, and hidden from assistive technology', async () => {
    // The grid repeats times the markers already carry; announcing it would be noise.
    const grid = await renderTimeline();

    expect(grid.style.pointerEvents).toBe('none');
    expect(grid).toHaveAttribute('aria-hidden', 'true');
  });

  it('sits behind the surfaces it is drawn for', async () => {
    // Compared against its own sibling, not across stacking contexts: the grid and the box
    // holding the transport and the timeline are the two children that share a parent, and
    // theirs is the only z-index comparison the browser actually resolves between them.
    const grid = await renderTimeline();
    const above = screen.getByTestId('transport-row').closest('[style*="z-index"]') as HTMLElement;

    expect(grid.parentElement?.contains(above)).toBe(true);
    expect(Number(grid.style.zIndex)).toBeLessThan(Number(above.style.zIndex));
  });

  it('keeps the playhead above the rows inside the timeline', async () => {
    await renderTimeline();
    const playhead = screen.getByTestId('timeline-playhead').parentElement as HTMLElement;
    const rows = screen.getByTestId('timeline-content');

    expect(Number(rows.style.zIndex)).toBeLessThan(Number(playhead.style.zIndex));
  });
});
