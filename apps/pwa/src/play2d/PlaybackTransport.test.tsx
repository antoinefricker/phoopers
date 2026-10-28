import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Keyframe, Play, PlayerId, Step, StepId } from '../engine';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlaybackTransport, THUMB_SIZE_PX } from './PlaybackTransport';
import { PlayView } from './PlayView';
import { ZOOM_LEVELS, contentWidthPx } from '../editor/timelineScale';
import { enterEditMode, renderEditor } from '../editor/testUtils/renderEditor';
import { fixturePlay, ROOT } from '../engine/__fixtures__/play';
import { resolveBranch } from '../engine';
import { stubViewportWidth } from '../testUtils/viewport';
import {
  TIME_GRID_S,
  TRACK_INSET_END_PX,
  TRACK_INSET_START_PX,
  adjacentStep,
  sliderMax,
  snapToGrid,
  snapToStep,
  stepAt,
  stepLabelAt,
  stepMarks,
} from './transportMath';
import { playheadTime } from '../testUtils/transport';

const steps: Step[] = [
  { id: 's1' as StepId, t: 2, name: 'Screen' },
  { id: 's2' as StepId, t: 4, name: 'Entry' },
];

describe('snapToStep', () => {
  it('snaps to a step inside the threshold', () => {
    expect(snapToStep(2.1, steps, 0.25)).toBe(2);
  });

  it('leaves a time outside the threshold alone', () => {
    expect(snapToStep(3, steps, 0.25)).toBe(3);
  });

  it('collapses steps that share a time onto that time', () => {
    const duplicates: Step[] = [
      { id: 'a' as StepId, t: 4, name: 'A' },
      { id: 'b' as StepId, t: 4, name: 'B' },
    ];

    expect(snapToStep(4.05, duplicates, 0.25)).toBe(4);
  });

  // Equal times make the brief's duplicate case trivially deterministic, so it cannot catch a
  // broken tie-break. Equidistant steps with different times can: the answer must not depend on
  // the order the steps happen to be stored in.
  it('resolves an exact tie to the earlier step regardless of step order', () => {
    const early: Step = { id: 'e' as StepId, t: 3.75, name: 'Early' };
    const late: Step = { id: 'l' as StepId, t: 4.25, name: 'Late' };

    expect(snapToStep(4, [early, late], 0.25)).toBe(3.75);
    expect(snapToStep(4, [late, early], 0.25)).toBe(3.75);
  });

  it('picks the nearer of two steps inside the threshold', () => {
    expect(
      snapToStep(
        2.2,
        [
          { id: 'a' as StepId, t: 2, name: 'A' },
          { id: 'b' as StepId, t: 2.3, name: 'B' },
        ],
        0.25,
      ),
    ).toBe(2.3);
  });

  it('returns the time unchanged when there are no steps', () => {
    expect(snapToStep(1.5, [], 0.25)).toBe(1.5);
  });
});

describe('adjacentStep', () => {
  // `steps` sits at 2 and 4; the play runs to 8 throughout.
  const DURATION = 8;

  it('finds the next step strictly after the current time', () => {
    expect(adjacentStep(2, steps, 1, DURATION)).toBe(4);
  });

  it('finds the previous step strictly before the current time', () => {
    expect(adjacentStep(4, steps, -1, DURATION)).toBe(2);
  });

  it('reaches the end of the play past the last step', () => {
    // Without the ends as stops a coach could reach every step but neither the opening
    // formation nor the final position, which are the two instants a play is most looked at.
    expect(adjacentStep(4, steps, 1, DURATION)).toBe(8);
  });

  it('reaches the start of the play before the first step', () => {
    expect(adjacentStep(2, steps, -1, DURATION)).toBe(0);
  });

  it('stops at the ends rather than moving nowhere', () => {
    expect(adjacentStep(8, steps, 1, DURATION)).toBeUndefined();
    expect(adjacentStep(0, steps, -1, DURATION)).toBeUndefined();
  });

  it('crosses the whole play when it holds no steps at all', () => {
    expect(adjacentStep(0, [], 1, DURATION)).toBe(8);
    expect(adjacentStep(8, [], -1, DURATION)).toBe(0);
  });

  it('counts a step sitting on an end once, not twice', () => {
    // Deduped, or going forward from 0 would land on 0 again and the button would do nothing.
    const onEnds: Step[] = [
      { id: 'a' as StepId, t: 0, name: 'Start' },
      { id: 'b' as StepId, t: 8, name: 'Finish' },
    ];

    expect(adjacentStep(0, onEnds, 1, DURATION)).toBe(8);
    expect(adjacentStep(8, onEnds, -1, DURATION)).toBe(0);
  });

  it('has only the start to offer for a play with no length', () => {
    expect(adjacentStep(0, [], 1, 0)).toBeUndefined();
    expect(adjacentStep(1, [], -1, 0)).toBe(0);
    expect(adjacentStep(0, [], 1, Number.NaN)).toBeUndefined();
  });

  it('is independent of the order steps are stored in', () => {
    const reversed = [...steps].reverse();

    expect(adjacentStep(0, reversed, 1, DURATION)).toBe(2);
    expect(adjacentStep(10, reversed, -1, DURATION)).toBe(8);
  });

  it('steps past a shared time in one jump', () => {
    const duplicates: Step[] = [
      { id: 'a' as StepId, t: 2, name: 'A' },
      { id: 'b' as StepId, t: 2, name: 'B' },
      { id: 'c' as StepId, t: 5, name: 'C' },
    ];

    expect(adjacentStep(2, duplicates, 1, DURATION)).toBe(5);
    expect(adjacentStep(5, duplicates, -1, DURATION)).toBe(2);
  });
});

describe('stepAt', () => {
  it('names the step the playhead has reached', () => {
    expect(stepAt(2, steps)?.name).toBe('Screen');
    expect(stepAt(3, steps)?.name).toBe('Screen');
    expect(stepAt(4, steps)?.name).toBe('Entry');
    expect(stepAt(99, steps)?.name).toBe('Entry');
  });

  it('has no step before the first one', () => {
    // A play can open on movement that belongs to no step yet, so there is nothing to name.
    expect(stepAt(0, steps)).toBeUndefined();
    expect(stepAt(1.999, steps)).toBeUndefined();
  });

  it('takes the later of two steps sharing a time', () => {
    // The ruler joins their names; the caption has room for one, and the last one authored at
    // that instant is the one the play has most recently reached.
    const tied: Step[] = [...steps, { id: 's3' as StepId, t: 2, name: 'Also here' }];

    expect(stepAt(2, tied)?.name).toBe('Also here');
  });

  it('is independent of the order steps are stored in', () => {
    expect(stepAt(3, [...steps].reverse())?.name).toBe('Screen');
  });

  it('has no step at all when there are none', () => {
    expect(stepAt(3, [])).toBeUndefined();
  });

  it('survives a non-finite time rather than naming a wrong step', () => {
    expect(stepAt(Number.NaN, steps)).toBeUndefined();
  });
});

describe('snapToGrid', () => {
  it('rounds to the nearest cell', () => {
    expect(snapToGrid(1.22)).toBe(1.2);
    expect(snapToGrid(1.26)).toBe(1.3);
    expect(snapToGrid(1.74)).toBe(1.7);
    expect(snapToGrid(1.78)).toBe(1.8);
  });

  it('rounds a half-way value up, not to even', () => {
    // Predictable beats statistically fair: a coach dragging right expects the next cell.
    expect(snapToGrid(1.25)).toBe(1.3);
    expect(snapToGrid(1.75)).toBe(1.8);
  });

  it('leaves a value already on the grid alone', () => {
    for (const t of [0, 0.1, 0.5, 2, 7.5]) expect(snapToGrid(t)).toBe(t);
  });

  it('gives back a clean multiple, not a float that nearly is', () => {
    // 63 cells of 0.1s multiply out to 6.300000000000001; the trap waits for any decimal cell,
    // so the result is rounded back onto the decimal rather than left as the product.
    expect(snapToGrid(6.33)).toBe(6.3);
    expect(String(snapToGrid(6.33))).toBe('6.3');
  });

  it('survives a time that is not a number', () => {
    expect(snapToGrid(Number.NaN)).toBe(0);
    expect(snapToGrid(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('never returns a negative time', () => {
    expect(snapToGrid(-0.2)).toBe(0);
  });
});

describe('stepLabelAt', () => {
  const screen2: Step = { id: 's1' as StepId, t: 2, name: 'Screen' };
  const entry4: Step = { id: 's2' as StepId, t: 4, name: 'Entry' };

  it('names nothing before the first step', () => {
    expect(stepLabelAt(1, [screen2, entry4], 8)).toBeUndefined();
  });

  it('runs to the next step when the step has no duration', () => {
    expect(stepLabelAt(3.9, [screen2, entry4], 8)?.name).toBe('Screen');
    expect(stepLabelAt(4, [screen2, entry4], 8)?.name).toBe('Entry');
  });

  it('runs to the end of the play for a last step with no duration', () => {
    expect(stepLabelAt(7.9, [screen2, entry4], 8)?.name).toBe('Entry');
  });

  it('stops naming a step once its duration is spent', () => {
    const brief = { ...screen2, duration: 0.5 };

    expect(stepLabelAt(2.4, [brief, entry4], 8)?.name).toBe('Screen');
    expect(stepLabelAt(2.6, [brief, entry4], 8)).toBeUndefined();
  });

  it('names the window that starts latest when one overruns another', () => {
    // A retime can leave this state, and the answer must not depend on the order the steps
    // happen to sit in the array.
    const overrunning = { ...screen2, duration: 5 };

    expect(stepLabelAt(4.5, [overrunning, entry4], 8)?.name).toBe('Entry');
    expect(stepLabelAt(4.5, [entry4, overrunning], 8)?.name).toBe('Entry');
  });

  it('names one of two steps sharing a time rather than none', () => {
    // The window is zero-length, so a half-open test would name neither.
    const tied: Step = { id: 's3' as StepId, t: 2, name: 'Also here' };

    expect(stepLabelAt(2, [screen2, tied], 8)).toBeDefined();
  });

  it('names nothing for a duration that is not a number', () => {
    // `validatePlay` reports it, which does not remove it from the play.
    const broken = { ...screen2, duration: Number.NaN };

    expect(stepLabelAt(3, [broken, entry4], 8)).toBeUndefined();
  });
});

describe('stepMarks', () => {
  it('gives one mark per distinct time, naming every step at that time', () => {
    const marks = stepMarks([
      { id: 'a' as StepId, t: 4, name: 'A' },
      { id: 'b' as StepId, t: 4, name: 'B' },
      { id: 'c' as StepId, t: 2, name: 'C' },
    ]);

    expect(marks).toEqual([
      { value: 2, label: 'C' },
      { value: 4, label: 'A / B' },
    ]);
  });
});

describe('sliderMax', () => {
  it('is the duration for a normal play', () => {
    expect(sliderMax(8)).toBe(8);
  });

  it('is never zero, negative or NaN', () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      const max = sliderMax(bad);
      expect(Number.isFinite(max)).toBe(true);
      expect(max).toBeGreaterThan(0);
    }
  });
});

// A frozen clock, so a playing transport cannot advance and finish on its own mid-test.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  // The window-width stub is a spy on a prototype, which outlives the test that made it.
  vi.restoreAllMocks();
});

const click = (element: HTMLElement) => fireEvent.click(element);

function renderTransport(play: Play = hornsPlay) {
  return render(
    <MantineProvider>
      <PlaybackContextProvider play={play}>
        <PlaybackTransport />
      </PlaybackContextProvider>
    </MantineProvider>,
  );
}

describe('PlaybackTransport', () => {
  it('toggles between play and pause', () => {
    renderTransport();

    click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('marks each step on the scrubber without naming it', () => {
    // The names moved to the step ruler, which sits directly below on the same axis and shows
    // them in full. Keeping them here too printed each one twice, centred and ellipsised
    // against the ruler's left-aligned text. The dots stay: they show where a drag snaps.
    const { container } = renderTransport();

    expect(container.querySelectorAll('.mantine-Slider-mark')).toHaveLength(steps.length);
    expect(screen.queryByText('Entry pass')).not.toBeInTheDocument();
    expect(screen.queryByText('Double high screen')).not.toBeInTheDocument();
  });

  it('jumps step by step, then to the end of the play, then stops', () => {
    // The sample's steps are at 2 and 4 and it runs to 8, so the end is a stop of its own:
    // a coach reaching the last step still has the final position to get to.
    renderTransport();
    const next = screen.getByRole('button', { name: 'Next step' });

    click(next);
    expect(playheadTime()).toBeCloseTo(2.0, 5);

    click(next);
    expect(playheadTime()).toBeCloseTo(4.0, 5);

    click(next);
    expect(playheadTime()).toBeCloseTo(8.0, 5);

    click(next);
    expect(playheadTime()).toBeCloseTo(8.0, 5);
  });

  it('jumps back to the start of the play before the first step', () => {
    renderTransport();

    click(screen.getByRole('button', { name: 'Next step' }));
    expect(playheadTime()).toBeCloseTo(2.0, 5);

    click(screen.getByRole('button', { name: 'Previous step' }));
    expect(playheadTime()).toBeCloseTo(0, 5);

    click(screen.getByRole('button', { name: 'Previous step' }));
    expect(playheadTime()).toBeCloseTo(0, 5);
  });

  it('jumps back to the previous step', () => {
    renderTransport();

    click(screen.getByRole('button', { name: 'Next step' }));
    click(screen.getByRole('button', { name: 'Next step' }));
    click(screen.getByRole('button', { name: 'Previous step' }));

    expect(playheadTime()).toBeCloseTo(2.0, 5);
  });

  it('pauses playback when a step button is used', () => {
    renderTransport();

    click(screen.getByRole('button', { name: 'Play' }));
    click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(playheadTime()).toBeCloseTo(2.0, 5);
  });

  it('pauses playback when the scrubber is moved', () => {
    renderTransport();

    click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // The scrub must both move the clock and stop it: End jumps to the last second.
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });

    expect(playheadTime()).toBeCloseTo(8.0, 5);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('lands exactly on the step time, not a rounded one', () => {
    renderTransport();

    click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '2');
    click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '4');
  });

  it('moves one increment per arrow press from rest', () => {
    renderTransport();
    const slider = screen.getByRole('slider');

    // Written against the cell rather than its value: the increment IS the grid, so the test
    // follows it rather than being rewritten each time the grid is retuned.
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', String(TIME_GRID_S));

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', String(2 * TIME_GRID_S));
  });

  it('lets arrow keys leave a step instead of snapping back onto it', () => {
    renderTransport();
    const slider = screen.getByRole('slider');

    // The next step is at 2s; one arrow press leaves it by a cell rather than snapping back.
    click(screen.getByRole('button', { name: 'Next step' }));
    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(slider).toHaveAttribute('aria-valuenow', String(2 + TIME_GRID_S));
  });

  it('scrubs straight to the grid, not onto a step nearby', () => {
    // 800 px wide track over 0..8 s: one pixel is 0.01 s. The fixture has a step at 2 s.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 10,
      width: 800,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const { container } = renderTransport();
    const track = container.querySelector('.mantine-Slider-track');
    if (track === null) throw new Error('slider root not found');

    // Either side of the step, inside the quarter second the scrubber used to be pulled across: it
    // held the playhead on the step from 1.75 to 2.25 and then let it jump, which read as odd
    // rounding. Now each lands where the pointer is, on the 0.1 s grid.
    for (const [clientX, expected] of [
      [190, '1.9'],
      [210, '2.1'],
      [180, '1.8'],
    ] as const) {
      fireEvent.mouseDown(track, { clientX, clientY: 5 });
      fireEvent.mouseUp(document);

      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', expected);
    }
    rect.mockRestore();
  });

  it('leaves a pointer scrub away from any step unsnapped', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 10,
      width: 800,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const { container } = renderTransport();
    const track = container.querySelector('.mantine-Slider-track');
    if (track === null) throw new Error('slider root not found');

    fireEvent.mouseDown(track, { clientX: 300, clientY: 5 });
    fireEvent.mouseUp(document);
    rect.mockRestore();

    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
  });

  it('renders a usable slider for a zero-duration play', () => {
    const at0: Keyframe = { t: 0, position: { x: 5, y: 5 } };
    const root = hornsPlay.branches[0];
    const player = hornsPlay.players[0];
    if (root === undefined || player === undefined) throw new Error('fixture changed');
    const frozen: Play = {
      ...hornsPlay,
      players: [player],
      branches: [{ ...root, steps: [], screens: [], tracks: { [player.id as PlayerId]: [at0] } as never }],
    };

    renderTransport(frozen);

    const slider = screen.getByRole('slider');
    expect(Number(slider.getAttribute('aria-valuemax'))).toBeGreaterThan(0);
    expect(slider.getAttribute('aria-valuenow')).not.toBe('NaN');
    expect(playheadTime()).toBeCloseTo(0.0, 5);
  });
});

describe('transport icons', () => {
  it('draws each control as an icon, not a text glyph', async () => {
    // The buttons used to read "<", "||" / ">" and ">" — prev and play looked alike. The
    // existing cases find these buttons by their accessible name, so they pass either way;
    // this one is what notices a silent fall back to glyphs.
    renderTransport();

    for (const name of ['Previous step', 'Play', 'Next step']) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg')).toBeInTheDocument();
      expect(button.textContent).toBe('');
    }
  });
});

describe('the scrubber', () => {
  beforeEach(() => stubViewportWidth(1440));

  const DURATION = resolveBranch(fixturePlay, ROOT).duration;
  const [LEVEL_1 = 24] = ZOOM_LEVELS;
  const SCALED_WIDTH = `${contentWidthPx(DURATION, LEVEL_1)}px`;

  const renderWatching = () => renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  const renderAuthoring = async () => {
    const view = renderWatching();
    await enterEditMode();

    return view;
  };

  it('takes the timeline scale while authoring', async () => {
    await renderAuthoring();

    expect(screen.getByTestId('scrubber-window-content').style.width).toBe(SCALED_WIDTH);
  });

  it('scrolls with the tracks while authoring', async () => {
    await renderAuthoring();
    const strip = screen.getByTestId('timeline-scrollbar');
    Object.defineProperty(strip, 'scrollLeft', { value: 120, configurable: true, writable: true });
    fireEvent.scroll(strip);

    expect(screen.getByTestId('scrubber-window-content').style.transform).toBe('translateX(-120px)');
  });

  // jsdom lays nothing out, so a clipped thumb cannot be seen; the computed style is the only
  // thing to pin. At an end the view has reached, the clip must reach half a thumb past the axis,
  // and the margin must give back what the padding took so the axis still begins TRACK_INSET_START_PX
  // in, like the tracks'. Anywhere else the clip stays at the axis edge, as the other surfaces'
  // does, or the track and the marks would spill into the gutter.
  // Narrower than the fixture's 960px of play, so there is something to scroll.
  const WINDOW_PX = 500;
  const scrubberEdges = () => {
    const style = getComputedStyle(screen.getByTestId('scrubber-window'));

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
  const stubWindowWidth = () =>
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

  it('keeps the thumb whole at the start without moving the axis', async () => {
    stubWindowWidth();
    await renderAuthoring();
    const { padding, margin } = scrubberEdges();

    expect(padding[0]).toBeGreaterThanOrEqual(THUMB_SIZE_PX / 2);
    expect(margin[0]! + padding[0]!).toBe(TRACK_INSET_START_PX);
    // The far end is out of view, so nothing hangs past the axis there.
    expect(padding[1]).toBe(0);
    expect(margin[1]).toBe(TRACK_INSET_END_PX);
  });

  it('keeps the thumb whole at the end of the play without moving the axis', async () => {
    stubWindowWidth();
    await renderAuthoring();
    scrollTo(Number.MAX_SAFE_INTEGER);
    const { padding, margin } = scrubberEdges();

    expect(padding[1]).toBeGreaterThanOrEqual(THUMB_SIZE_PX / 2);
    expect(margin[1]! + padding[1]!).toBe(TRACK_INSET_END_PX);
    expect(padding[0]).toBe(0);
  });

  it('clips at the axis edge, like the tracks, anywhere in between', async () => {
    stubWindowWidth();
    await renderAuthoring();
    scrollTo(120);
    const { padding, margin } = scrubberEdges();

    expect(padding).toEqual([0, 0]);
    expect(margin).toEqual([TRACK_INSET_START_PX, TRACK_INSET_END_PX]);
  });

  it('stays elastic while watching', () => {
    renderWatching();

    // No window, hence no fixed width to scroll within and nothing to scroll with.
    expect(screen.queryByTestId('scrubber-window')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-scrollbar')).not.toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('still seeks with the arrow keys at a fixed scale', async () => {
    await renderAuthoring();
    const slider = screen.getByRole('slider');

    fireEvent.keyDown(slider, { key: 'ArrowRight' });

    expect(slider).toHaveAttribute('aria-valuenow', String(TIME_GRID_S));
  });

  it('still shows a mark for every step in both modes', async () => {
    const stepCount = resolveBranch(fixturePlay, ROOT).steps.length;
    const { container, unmount } = renderWatching();
    const marksWatching = container.querySelectorAll('.mantine-Slider-mark').length;
    unmount();
    const authoring = await renderAuthoring();

    expect(marksWatching).toBe(stepCount);
    expect(authoring.container.querySelectorAll('.mantine-Slider-mark')).toHaveLength(stepCount);
  });
});
