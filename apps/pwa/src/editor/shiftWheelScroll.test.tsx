import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixturePlay, P1 } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { enterEditMode, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));
afterEach(() => vi.restoreAllMocks());

// jsdom lays nothing out, so the window's width is stubbed: the one that reports it takes this
// from its box. The fixture's play is 4 s, 960 px at the opening zoom, so a window narrower than
// that has somewhere to scroll and one wider has not.
const stubWindowWidth = (width: number) =>
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: 10,
    width,
    height: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

const renderTimeline = async (windowPx: number) => {
  stubWindowWidth(windowPx);
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

const surface = () => screen.getByTestId('timeline-surface');

/**
 * Whether the gesture cancelled the wheel's default action, read just after it, from the view's
 * own root: `fireEvent`'s return value also reflects handlers further up (the vertical scroll
 * area's), which say nothing about this one.
 */
const wheel = (init: WheelEventInit): boolean => {
  const host = surface().closest('.mantine-Stack-root');
  let cancelled = false;
  const watch = (event: Event) => {
    cancelled = event.defaultPrevented;
  };
  host?.addEventListener('wheel', watch);
  fireEvent.wheel(surface(), init);
  host?.removeEventListener('wheel', watch);

  return cancelled;
};
const offset = () => {
  const match = /translateX\((-?[\d.]+)px\)/.exec(screen.getByTestId(`timeline-window-${P1}-content`).style.transform);

  return match === null ? NaN : 0 - Number(match[1]);
};
const contentWidth = () => parseFloat(screen.getByTestId(`timeline-window-${P1}-content`).style.width);
const WINDOW_PX = 500;

describe('Shift + the wheel over the timeline', () => {
  it('scrolls the time axis by the wheel delta', async () => {
    await renderTimeline(WINDOW_PX);

    fireEvent.wheel(surface(), { shiftKey: true, deltaY: 120 });

    expect(offset()).toBe(120);
  });

  it('scrolls back the other way, and by the horizontal delta where the browser sends one', async () => {
    await renderTimeline(WINDOW_PX);
    fireEvent.wheel(surface(), { shiftKey: true, deltaY: 200 });

    fireEvent.wheel(surface(), { shiftKey: true, deltaX: -80, deltaY: 0 });

    expect(offset()).toBe(120);
  });

  it('reads a delta reported in lines', async () => {
    await renderTimeline(WINDOW_PX);

    fireEvent.wheel(surface(), { shiftKey: true, deltaY: 3, deltaMode: 1 });

    expect(offset()).toBe(120);
  });

  it('stops at both ends of the play', async () => {
    await renderTimeline(WINDOW_PX);

    fireEvent.wheel(surface(), { shiftKey: true, deltaY: 99999 });
    expect(offset()).toBe(contentWidth() - WINDOW_PX);

    fireEvent.wheel(surface(), { shiftKey: true, deltaY: -99999 });
    expect(offset()).toBe(0);
  });

  it('keeps the page from scrolling under a wheel it used', async () => {
    await renderTimeline(WINDOW_PX);

    expect(wheel({ shiftKey: true, deltaY: 120 })).toBe(true);
  });

  it('leaves a wheel without Shift to scroll the rows', async () => {
    await renderTimeline(WINDOW_PX);

    expect(wheel({ deltaY: 120 })).toBe(false);
    expect(offset()).toBe(0);
  });

  it('leaves a pinch or a browser chord alone', async () => {
    await renderTimeline(WINDOW_PX);

    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(wheel({ shiftKey: true, deltaY: 120, ...modifier })).toBe(false);
    }

    expect(offset()).toBe(0);
  });

  it('does nothing, and cancels nothing, when the whole play fits the window', async () => {
    await renderTimeline(5000);

    expect(wheel({ shiftKey: true, deltaY: 120 })).toBe(false);
    expect(offset()).toBe(0);
  });
});
