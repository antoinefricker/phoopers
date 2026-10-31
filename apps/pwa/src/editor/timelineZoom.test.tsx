import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixturePlay, P1, SCREEN_1, STEP_ENTRY } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { enterEditMode, renderEditor } from './testUtils/renderEditor';
import { TRACK_INSET_END_PX, TRACK_INSET_START_PX, markerLeftPx } from './timelineGeometry';

beforeEach(() => stubViewportWidth(1440));
afterEach(() => vi.restoreAllMocks());

const zoomIn = () => screen.getByRole('button', { name: 'Zoom in' });
const zoomOut = () => screen.getByRole('button', { name: 'Zoom out' });
// What a coach sees widen: the width of one row's track content.
const trackWidth = () => screen.getByTestId(`timeline-window-${P1}-content`).style.width;

const renderTimeline = async () => {
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

describe('the zoom control', () => {
  it('cannot go finer than the level it opens at', async () => {
    await renderTimeline();

    expect(zoomIn()).toBeDisabled();
    expect(zoomOut()).toBeEnabled();
  });

  it('widens the view a step at a time', async () => {
    await renderTimeline();
    const opening = parseFloat(trackWidth());

    // Each level is a fixed fraction of the opening one (24, 18, 12, 6 px per cell).
    for (const px of [18, 12, 6]) {
      fireEvent.click(zoomOut());
      expect(parseFloat(trackWidth())).toBeCloseTo((opening * px) / 24);
    }
  });

  it('stops at the widest level', async () => {
    await renderTimeline();

    for (let i = 0; i < 3; i++) fireEvent.click(zoomOut());

    expect(zoomOut()).toBeDisabled();
    expect(zoomIn()).toBeEnabled();
  });

  it('is absent while watching', () => {
    // Watching is the mode the editor opens in, and the timeline is not rendered there.
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

    expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument();
  });
});

describe('a keyframe marker occupies its grid cell', () => {
  const markers = () =>
    within(screen.getByTestId(`timeline-track-${P1}`))
      .getAllByRole('button')
      .filter((marker) => marker.getAttribute('aria-label')?.startsWith('Keyframe at'));

  it('begins on the line of its time and is one cell wide, at every zoom', async () => {
    await renderTimeline();

    for (const px of [24, 18, 12, 6]) {
      for (const marker of markers()) {
        const time = Number(/Keyframe at ([\d.]+)s/.exec(marker.getAttribute('aria-label') ?? '')?.[1]);

        expect(marker.style.left).toBe(markerLeftPx(time, px));
        expect(marker.style.width).toBe(`${px - 4}px`);
      }
      if (px > 6) fireEvent.click(zoomOut());
    }
  });

  it('is no longer centred on its time', async () => {
    await renderTimeline();

    for (const marker of markers()) {
      // Only the vertical centring is left: a horizontal one would shift it half a cell back.
      expect(marker.style.transform).toBe('translateY(-50%)');
    }
  });

  describe('on the last time', () => {
    // jsdom lays nothing out, so a clipped marker cannot be seen; the computed style is the only
    // thing to pin. The window is made narrower than the play (960px in this fixture) so there
    // is something to scroll, then scrolled to the end.
    const WINDOW_PX = 500;
    const edges = () => {
      const style = getComputedStyle(screen.getByTestId(`timeline-window-${P1}`));

      return {
        padding: [parseFloat(style.paddingLeft), parseFloat(style.paddingRight)],
        margin: [parseFloat(style.marginLeft), parseFloat(style.marginRight)],
      };
    };
    const scrollTo = (offset: number) => {
      const strip = screen.getByTestId('timeline-scrollbar');
      Object.defineProperty(strip, 'scrollLeft', { value: offset, configurable: true, writable: true });
      fireEvent.scroll(strip);
    };

    beforeEach(() => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        right: WINDOW_PX,
        bottom: 10,
        width: WINDOW_PX,
        height: 10,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    });

    it('lets the row window show a marker that hangs one cell past the axis', async () => {
      await renderTimeline();
      scrollTo(Number.MAX_SAFE_INTEGER);
      const { padding, margin } = edges();

      // The clip moves out by a cell at the end the view has reached, and the margin gives that
      // cell back so the axis still ends where every other surface's does. Nothing hangs left.
      expect(padding[1]).toBe(24);
      expect(margin[1]! + padding[1]!).toBe(TRACK_INSET_END_PX);
      expect(padding[0]).toBe(0);
    });

    it('keeps the clip at the axis edge before the end is reached', async () => {
      await renderTimeline();
      const { padding, margin } = edges();

      expect(padding).toEqual([0, 0]);
      expect(margin).toEqual([TRACK_INSET_START_PX, TRACK_INSET_END_PX]);
    });
  });
});

describe('the handles of a bar occupy a grid cell', () => {
  const handleIds = [`step-start-handle-${STEP_ENTRY}`, `step-handle-${STEP_ENTRY}`, `screen-handle-${SCREEN_1}`];

  it('sit a cell less twice the padding wide at every zoom, and are never more than half their bar', async () => {
    await renderTimeline();

    for (const px of [24, 18, 12, 6]) {
      for (const id of handleIds) {
        // `min()` is what keeps two handles on a bar as short as it may be from covering each other.
        // The bar gives its handle a slot that is as wide as the handle.
        expect(screen.getByTestId(id).parentElement?.style.width).toBe(`min(${px - 4}px, 50% - 2px)`);
      }
      if (px > 6) fireEvent.click(zoomOut());
    }
  });
});

describe('the controls of a bar occupy a grid cell', () => {
  it('are one cell wide at every zoom', async () => {
    await renderTimeline();
    const controls = () => [
      screen.getByRole('button', { name: 'Edit Entry pass' }),
      screen.getByRole('button', { name: 'Remove Entry pass' }),
      screen.getByTestId(`screen-remove-${SCREEN_1}`),
    ];

    for (const px of [24, 18, 12, 6]) {
      for (const control of controls()) {
        expect(control.style.width).toBe(`${px}px`);
        expect(control.style.minWidth).toBe(`${px}px`);
      }
      if (px > 6) fireEvent.click(zoomOut());
    }
  });
});
