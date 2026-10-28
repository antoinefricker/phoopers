import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixturePlay, P1, ROOT } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { enterEditMode, readProbe, renderEditor, trackOf } from './testUtils/renderEditor';

// jsdom lays nothing out, so the window is given a width by hand: 400px is narrower than the
// 960px the fixture's four seconds take at the opening zoom, so there is something to scroll.
const WINDOW_PX = 400;
// At 24px per 0.1 s cell a second is 240px. The follow band is 10 % to 90 % of the window.
const PX_PER_SECOND = 240;

// Off by default: a marker's own box would change where a drag counts its grab from.
let markersLaidOut = false;
let now = 0;
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

beforeEach(() => {
  stubViewportWidth(1440);
  markersLaidOut = false;
  now = 0;
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextFrame, cb);

    return nextFrame++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  // The scrolled content's left edge is where a real layout would put it: minus the offset it is
  // translated by. Everything else sits at the origin, the one window with a width.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    const id = el.getAttribute('data-testid') ?? '';
    const shift = /translateX\((-?[\d.]+)px\)/.exec(el.style.transform)?.[1] ?? '0';
    const width = id.endsWith('-window') || id === 'step-ruler-window' || id === 'timeline-axis-area' ? WINDOW_PX : 0;

    // A keyframe marker sits at its time along the content, wherever the view has carried it.
    const at = /^Keyframe at ([\d.]+)s$/.exec(el.getAttribute('aria-label') ?? '')?.[1];
    if (at !== undefined && markersLaidOut) {
      const offset = Number(
        /translateX\((-?[\d.]+)px\)/.exec(
          el.closest<HTMLElement>('[data-testid$="-content"]')?.style.transform ?? '',
        )?.[1] ?? 0,
      );

      return new DOMRect(Number(at) * PX_PER_SECOND + offset, 0, 12, 18);
    }

    // The playhead's content is as wide as the play, so a press on it is on the axis.
    if (id === 'timeline-axis-content') return new DOMRect(Number(shift), 0, 960, 0);

    return new DOMRect(id.endsWith('-content') ? Number(shift) : 0, 0, width, 0);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// One animation frame, `ms` after the last. The clock ignores its first frame (it has no
// previous stamp to measure from), so a play always starts with a zero-length one.
function advance(ms: number) {
  now += ms;
  const pending = frames;
  frames = new Map();
  act(() => {
    for (const frame of pending.values()) frame(now);
  });
}

const renderTimeline = async () => {
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

const offsetOf = () => screen.getByTestId(`timeline-window-${P1}-content`).style.transform;
const keyframe = (t: number) =>
  within(screen.getByTestId(`timeline-row-${P1}`)).getByRole('button', { name: `Keyframe at ${t}s` });
// A seek the way a coach does it, without touching the clock's running state.
const seekTo = (t: number) => fireEvent.click(keyframe(t));

const scrollbarTo = (offset: number) => {
  const strip = screen.getByTestId('timeline-scrollbar');
  Object.defineProperty(strip, 'scrollLeft', { value: offset, configurable: true, writable: true });
  fireEvent.scroll(strip);
};

const startPlaying = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Play' }));
  // The clock's opening frame, which only records its stamp.
  advance(0);
};

describe('the view while the play runs', () => {
  it('holds still while the playhead is inside the band', async () => {
    await renderTimeline();
    await startPlaying();

    // A second in is 240px, inside the 40 to 360px band of a 400px window.
    advance(1000);

    expect(offsetOf()).toBe('translateX(0px)');
  });

  it('carries the playhead at the far edge', async () => {
    await renderTimeline();
    await startPlaying();

    // Two seconds in is 480px, 120px past the band's far edge at 360px, so the view moves by
    // exactly that to hold the playhead on the edge.
    advance(2000);

    expect(offsetOf()).toBe(`translateX(-${2 * PX_PER_SECOND - WINDOW_PX * 0.9}px)`);
  });

  it('does not move on its own while the play is stopped', async () => {
    await renderTimeline();

    // A keyframe at 4s is 960px along, far outside the window, and selecting one seeks to it.
    // Following is for a play that runs: a stopped one has a coach pointing, not a clock moving.
    seekTo(4);

    expect(offsetOf()).toBe('translateX(0px)');
  });
});

describe('the view around a zoom', () => {
  it('keeps the playhead where it was in the window', async () => {
    await renderTimeline();
    scrollbarTo(300);
    seekTo(2);
    // 480px along, 300px scrolled: 180px into the window.
    expect(offsetOf()).toBe('translateX(-300px)');

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

    // At 18px per cell the playhead is 360px along, so the offset that keeps it 180px in is 180px.
    expect(offsetOf()).toBe('translateX(-180px)');
  });

  it('never leaves the view past the end of a shorter play', async () => {
    await renderTimeline();
    scrollbarTo(WINDOW_PX * 1.4);
    seekTo(4);

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

    // Zooming out shrinks the content from 960px to 720px, whose furthest offset is 320px. The
    // offset it had before, 560px, would sit 240px past that if nothing settled it with the zoom.
    expect(offsetOf()).toBe('translateX(-320px)');
  });
});

describe('the view during a drag', () => {
  it('scrolls when the pointer reaches the edge, and the drag goes on', async () => {
    await renderTimeline();
    const user = userEvent.setup();
    const marker = keyframe(2);

    // Pressed at x = 0, where the mocked marker sits, so the grab offset is nothing and the
    // pointer's x is the marker's.
    await user.pointer([
      { keys: '[MouseLeft>]', target: marker, coords: { clientX: 0, clientY: 0 } },
      { target: marker, coords: { clientX: WINDOW_PX - 11, clientY: 0 } },
      { target: marker, coords: { clientX: WINDOW_PX - 10, clientY: 0 } },
    ]);

    // Within 24px of the right edge, each move steps the view along by 24px.
    expect(offsetOf()).toBe('translateX(-48px)');

    await user.pointer({ keys: '[/MouseLeft]', target: marker });

    // The time committed is the one under the pointer after the view moved (390 + 48 = 438px,
    // 18.25 cells, so 1.8 s), not the one under it before (390px, 16.25 cells, so 1.6 s). Both sit
    // well off a half cell, so a change to how ties round cannot flip this.
    expect(trackOf(readProbe().play, ROOT, P1).map((k) => k.t)).toContain(1.8);
  });
});

describe('the view while a drag is held at the edge', () => {
  const pressAtEdge = async () => {
    await renderTimeline();
    const user = userEvent.setup();
    const marker = keyframe(2);

    await user.pointer([
      { keys: '[MouseLeft>]', target: marker, coords: { clientX: 0, clientY: 0 } },
      { target: marker, coords: { clientX: WINDOW_PX - 10, clientY: 0 } },
    ]);

    return { user, marker };
  };

  it('keeps scrolling on every frame without the pointer moving', async () => {
    await pressAtEdge();
    expect(offsetOf()).toBe('translateX(-24px)');

    advance(16);
    advance(16);

    expect(offsetOf()).toBe('translateX(-72px)');
  });

  it('stops when the pointer is released in the edge zone', async () => {
    const { user, marker } = await pressAtEdge();
    advance(16);

    await user.pointer({ keys: '[/MouseLeft]', target: marker });
    const released = offsetOf();
    advance(16);
    advance(16);

    expect(offsetOf()).toBe(released);
    expect(frames.size).toBe(0);
  });

  it('stops when the pointer leaves the zone', async () => {
    const { user, marker } = await pressAtEdge();

    await user.pointer({ target: marker, coords: { clientX: 200, clientY: 0 } });
    const left = offsetOf();
    advance(16);
    advance(16);

    expect(offsetOf()).toBe(left);
  });

  it('stops at the end of the content', async () => {
    await pressAtEdge();

    // 960px of content in a 400px window: 560px is the furthest it goes, 24 steps in.
    for (let i = 0; i < 40; i++) advance(16);

    expect(offsetOf()).toBe('translateX(-560px)');
    expect(frames.size).toBe(0);
  });

  it('carries the playhead dragged along the surface', async () => {
    await renderTimeline();
    const surface = screen.getByTestId('timeline-surface');

    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(surface, { clientX: WINDOW_PX - 10, clientY: 0 });
    expect(offsetOf()).toBe('translateX(-24px)');

    advance(16);
    expect(offsetOf()).toBe('translateX(-48px)');

    fireEvent.pointerUp(surface);
    advance(16);

    expect(offsetOf()).toBe('translateX(-48px)');
    expect(frames.size).toBe(0);
  });
});

describe('the view when focus reaches a marker out of sight', () => {
  it('carries the view to it, and leaves no offset of the window own', async () => {
    await renderTimeline();
    markersLaidOut = true;
    const window = screen.getByTestId(`timeline-window-${P1}`);
    // What the browser does on its own to an overflow: hidden box when focus lands out of view:
    // it sets scrollLeft with no scrollbar to show it. jsdom does not, so it is done by hand.
    Object.defineProperty(window, 'scrollLeft', { value: 0, configurable: true, writable: true });

    // A Tab, which is what brings keyboard focus to something out of sight.
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => keyframe(4).focus());
    window.scrollLeft = 500;
    fireEvent.scroll(window);

    // The marker's far edge is 972px along, 572px past a 400px window, but the content is only
    // 960px wide and its furthest offset is 560px, where the marker is in sight. The window's
    // own offset is back to zero.
    expect(offsetOf()).toBe('translateX(-560px)');
    expect(window.scrollLeft).toBe(0);
  });

  it('leaves the view alone when focus comes from a press, which is already where the pointer is', async () => {
    await renderTimeline();
    markersLaidOut = true;

    fireEvent.pointerDown(document.body);
    act(() => keyframe(4).focus());

    expect(offsetOf()).toBe('translateX(0px)');
  });

  it('leaves the view alone for focus nobody asked for, such as a dialog giving it back after a click', async () => {
    await renderTimeline();
    markersLaidOut = true;

    // A press, then focus arriving by code with no key between: the press is the last input.
    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    act(() => keyframe(4).focus());

    expect(offsetOf()).toBe('translateX(0px)');
  });

  it('carries the view again for a key pressed after a press', async () => {
    await renderTimeline();
    markersLaidOut = true;
    fireEvent.pointerDown(document.body);

    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => keyframe(4).focus());

    expect(offsetOf()).toBe('translateX(-560px)');
  });
});
