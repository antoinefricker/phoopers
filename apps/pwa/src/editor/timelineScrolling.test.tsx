import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveBranch } from '../engine';
import type { Play } from '../engine';
import { fixturePlay, P1, ROOT } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { ZOOM_LEVELS, contentWidthPx } from './timelineScale';
import { enterEditMode, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

// The fixture's own length, resolved from the branch rather than written down: the expected
// widths below are the play's duration at the opening zoom, so they follow the fixture.
const DURATION = resolveBranch(fixturePlay, ROOT).duration;
const [LEVEL_1 = 24] = ZOOM_LEVELS;
const FIXTURE_WIDTH = contentWidthPx(DURATION, LEVEL_1);

const renderTimeline = async (play: Play = fixturePlay) => {
  renderEditor(play, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

/**
 * Drag the one scrollbar to an offset.
 *
 * jsdom lays nothing out, so its `scrollLeft` setter is a no-op and assigning through
 * `fireEvent`'s `target` would leave the strip at zero. Defining the property is what makes the
 * handler read the offset a real scrollbar would have reported.
 */
const scrollTo = (offset: number) => {
  const strip = screen.getByTestId('timeline-scrollbar');
  Object.defineProperty(strip, 'scrollLeft', { value: offset, configurable: true, writable: true });
  fireEvent.scroll(strip);
};

const contentOf = (testId: string) => screen.getByTestId(`${testId}-content`);

describe('the timeline as one surface', () => {
  it('gives every time surface the same offset', async () => {
    await renderTimeline();

    scrollTo(300);

    // The grid, the ruler, a row's track and the playhead's overlay: four surfaces, one axis.
    for (const surface of ['time-grid-window', 'step-ruler-window', `timeline-window-${P1}`, 'timeline-axis']) {
      expect(contentOf(surface).style.transform).toBe('translateX(-300px)');
    }
  });

  it('is as wide as the play, not as wide as the window', async () => {
    await renderTimeline();

    // 1440px of window, and the play takes the width it needs at 24px per 0.1s cell.
    expect(contentOf(`timeline-window-${P1}`).style.width).toBe(`${FIXTURE_WIDTH}px`);
    expect(contentOf('step-ruler-window').style.width).toBe(`${FIXTURE_WIDTH}px`);
  });

  it('clips the axis at the window rather than letting the panel grow a bar of its own', async () => {
    await renderTimeline();

    expect(screen.getByTestId(`timeline-window-${P1}`).style.overflow).toBe('hidden');
  });

  it('keeps the gutter still while the tracks move', async () => {
    await renderTimeline();

    scrollTo(300);

    // The column holding the name, the symbol and the row's controls is outside the window, so
    // a coach deep into a play can still rename or hide a player.
    expect(screen.getByTestId(`row-gutter-${P1}`).style.transform).toBe('');
  });

  it('reserves the scrollbar place whether or not it scrolls', async () => {
    // A play of a single second fits any window this app runs in, so the strip has nowhere to
    // go. It is still in the document: a gutter that appeared with the bar would move the axis
    // under the coach's pointer the moment a play grew past the window.
    const short: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches
        .filter((branch) => branch.id === ROOT)
        .map((branch) => ({
          ...branch,
          steps: [],
          screens: [],
          tracks: {
            ball: [],
            [P1]: [
              { t: 0, position: { x: 4, y: 7.5 } },
              { t: 1, position: { x: 8, y: 5 } },
            ],
          },
        })),
    };
    await renderTimeline(short);

    expect(screen.getByTestId('timeline-scrollbar')).toBeInTheDocument();
    expect(contentOf(`timeline-window-${P1}`).style.width).toBe(`${contentWidthPx(1, LEVEL_1)}px`);
  });

  it('stops the offset at the end of the play', async () => {
    await renderTimeline();

    scrollTo(99999);

    // jsdom measures every box as zero wide, so the whole content is scrollable here and the
    // furthest the view goes is its own width. The clamp is what keeps the axis from running
    // off into empty space.
    expect(contentOf('step-ruler-window').style.transform).toBe(`translateX(-${FIXTURE_WIDTH}px)`);
  });

  it('does not pull the strip back to a position it reported while the coach dragged on', async () => {
    await renderTimeline();
    const strip = screen.getByTestId('timeline-scrollbar');

    // A real drag outruns React: the scroll event carries the offset the strip had when it was
    // queued, and by the time the commit lands the browser has moved the strip further. The first
    // read stands for the handler, every later one for the strip after the coach moved on.
    let reads = 0;
    const writes: number[] = [];
    Object.defineProperty(strip, 'scrollLeft', {
      configurable: true,
      get: () => (reads++ === 0 ? 100 : 200),
      set: (value: number) => writes.push(value),
    });
    fireEvent.scroll(strip);

    expect(writes).toEqual([]);
  });
});
