import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import { ROOT, fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { gridTicks } from './timelineGeometry';
import { renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const enterEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Edit' }));

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

  it('shares the axis insets with the playhead, so a line lands on the track and not past it', async () => {
    const grid = await renderTimeline();
    const playhead = screen.getByTestId('timeline-playhead').parentElement;

    expect(grid.style.left).toBe(playhead?.style.left);
    expect(grid.style.right).toBe(playhead?.style.right);
  });

  it('stays out of the way: no pointer events, and hidden from assistive technology', async () => {
    // The grid repeats times the markers already carry; announcing it would be noise.
    const grid = await renderTimeline();

    expect(grid.style.pointerEvents).toBe('none');
    expect(grid).toHaveAttribute('aria-hidden', 'true');
  });

  it('sits behind the rows and under the playhead', async () => {
    const grid = await renderTimeline();
    const playhead = screen.getByTestId('timeline-playhead').parentElement;
    const rows = screen.getByTestId('timeline-content');

    expect(Number(grid.style.zIndex)).toBeLessThan(Number(rows.style.zIndex));
    expect(Number(rows.style.zIndex)).toBeLessThan(Number(playhead?.style.zIndex));
  });
});
