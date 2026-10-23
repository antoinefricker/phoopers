import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StepId } from '../engine';
import { fixturePlay, ROOT, STEP_ENTRY, SWITCH } from '../engine/__fixtures__/play';
import { TIME_GRID_S } from '../play2d/transportMath';
import { StepRuler } from './StepRuler';
import { leftPx, spanPx } from './timelineGeometry';
import { ZOOM_LEVELS, xOfTime } from './timelineScale';
import { dragElement, LivePlayback, readProbe, renderEditor, SelectBranch } from './testUtils/renderEditor';

// The level the editor opens at, which is the one every expectation below is written against.
const [LEVEL_1 = 24] = ZOOM_LEVELS;

const renderLive = () =>
  renderEditor(
    fixturePlay,
    <LivePlayback>
      <StepRuler />
    </LivePlayback>,
    { wrapPlayback: false },
  );

const stepsOfRoot = () => readProbe().play.branches.find((b) => b.id === ROOT)?.steps ?? [];

// jsdom has no layout, so floating-ui sees every reference as clipped by a 0x0 viewport and Mantine
// hides the popover dropdown (display: none), which cannot then be focused. Give the page a real
// viewport and every box a non-zero size. Applied only to the tests that open the editor, because
// it would also give the ruler a width.
const stubLayout = () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 10,
    top: 10,
    width: 100,
    height: 20,
    right: 110,
    bottom: 30,
    x: 10,
    y: 10,
    toJSON: () => ({}),
  });
  Object.defineProperty(document.documentElement, 'clientWidth', { value: 1000, configurable: true });
  Object.defineProperty(document.documentElement, 'clientHeight', { value: 800, configurable: true });
};

describe('StepRuler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document.documentElement, 'clientWidth');
    Reflect.deleteProperty(document.documentElement, 'clientHeight');
  });

  it('renders one bar per step, labelled with its name', () => {
    renderEditor(fixturePlay, <StepRuler />);
    const ruler = screen.getByTestId('step-ruler');

    // The duration handle, edit and remove. Adding a step moved to the transport.
    expect(within(ruler).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('Entry pass')).toBeInTheDocument();
  });

  it('starts a bar at its distance from the start of the play', () => {
    renderEditor(fixturePlay, <StepRuler />);

    // Step at t=2, at 24px per 0.1s cell: a distance, not a share of the panel.
    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.left).toBe(leftPx(2, LEVEL_1));
  });

  it('renames a step', async () => {
    stubLayout();
    renderEditor(fixturePlay, <StepRuler />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit Entry pass' }));
    const input = await screen.findByRole('textbox', { name: 'Step name' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Horns entry');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.name).toBe('Horns entry');
  });

  it('refuses to remove a step a branch forks from', async () => {
    stubLayout();
    renderEditor(fixturePlay, <StepRuler />);
    const before = stepsOfRoot().length;

    await userEvent.click(screen.getByRole('button', { name: 'Edit Entry pass' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    // SWITCH forks from this step; dropping it would orphan that branch.
    expect(stepsOfRoot()).toHaveLength(before);
    expect(readProbe().play.branches.some((b) => b.id === SWITCH)).toBe(true);
  });

  it('removes a step no branch forks from', async () => {
    // A second step written into the play rather than added through the interface: the control
    // that adds one lives in the transport now, which this case does not render.
    const free = 'free-step' as StepId;
    const twoSteps = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT ? { ...b, steps: [...b.steps, { id: free, t: 3, name: 'Free step' }] } : b,
      ),
    };
    stubLayout();
    renderEditor(
      twoSteps,
      <LivePlayback>
        <StepRuler />
      </LivePlayback>,
      { wrapPlayback: false },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Edit Free step' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(stepsOfRoot().map((s) => s.id)).toEqual([STEP_ENTRY]);
  });

  it('retimes a step by dragging its bar, and the drag demonstrably acted', async () => {
    renderEditor(fixturePlay, <StepRuler />);

    await dragElement(screen.getByTestId(`step-bar-${STEP_ENTRY}`));

    // jsdom puts every box at x=0, so the release at clientX 120 is 120px along the axis — half
    // a second at 24px a cell. The root branch has no fork floor above 0 to stop it.
    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBeCloseTo(0.5, 6);
  });

  it('opens no editor after a drag', async () => {
    stubLayout();
    renderEditor(fixturePlay, <StepRuler />);

    await dragElement(screen.getByTestId(`step-bar-${STEP_ENTRY}`));

    // The bar is not what opens the editor; the click the browser fires on release reaches
    // nothing that would.
    expect(screen.queryByRole('textbox', { name: 'Step name' })).not.toBeInTheDocument();
  });

  it('does not let a descendant branch retime or edit an ancestor step', async () => {
    stubLayout();
    renderEditor(
      fixturePlay,
      <>
        <SelectBranch branchId={SWITCH} />
        <StepRuler />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));

    // Viewing SWITCH, the root's step is the root's: it is shown, but it is not a control.
    expect(screen.queryByRole('button', { name: 'Edit Entry pass' })).not.toBeInTheDocument();
    const bar = screen.getByTestId(`step-bar-${STEP_ENTRY}`);
    expect(bar).toHaveAttribute('data-inherited', 'true');
    // Inert by construction rather than by a guard inside a handler: it takes no pointer at
    // all, carries no handle, and cannot be focused into a keyboard nudge.
    expect(window.getComputedStyle(bar).pointerEvents).toBe('none');
    expect(bar).not.toHaveAttribute('tabindex');
    expect(screen.queryByTestId(`step-handle-${STEP_ENTRY}`)).not.toBeInTheDocument();

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(2);
    expect(screen.queryByRole('textbox', { name: 'Step name' })).not.toBeInTheDocument();
  });

  it('floors a step drag at the fork time of the branch that owns it', async () => {
    const own = 'switch-step' as StepId;
    const play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === SWITCH ? { ...b, steps: [{ id: own, t: 3, name: 'Switch step' }] } : b,
      ),
    };
    renderEditor(
      play,
      <>
        <SelectBranch branchId={SWITCH} />
        <StepRuler />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));

    // No layout: the raw drop is t=0, before the branch forks at 2. The drag must stop at the fork.
    await dragElement(screen.getByTestId('step-bar-switch-step'));

    const steps = readProbe().play.branches.find((b) => b.id === SWITCH)?.steps ?? [];
    expect(steps.find((s) => s.id === own)?.t).toBe(2);
  });

  it('stops a fork step at its child branch first keyframe when dragged later', async () => {
    renderEditor(fixturePlay, <StepRuler />);
    const user = userEvent.setup();
    const bar = screen.getByTestId(`step-bar-${STEP_ENTRY}`);

    // Dragged to 3.5s, well past where it may go. No stub: every box is at x=0 in jsdom, so a
    // clientX IS a distance along the axis, and the scale turns it into a time.
    await user.pointer([
      { keys: '[MouseLeft>]', target: bar, coords: { clientX: 0, clientY: 0 } },
      { target: bar, coords: { clientX: xOfTime(2.5, LEVEL_1), clientY: 0 } },
      { target: bar, coords: { clientX: xOfTime(3.5, LEVEL_1), clientY: 0 } },
      { keys: '[/MouseLeft]', target: bar, coords: { clientX: xOfTime(3.5, LEVEL_1), clientY: 0 } },
    ]);

    // SWITCH forks from this step and its first keyframe is at 2: moving the step later would
    // put that keyframe before its own fork.
    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(2);
  });

  it('nudges a focused step by one grid cell per arrow press', async () => {
    // No layout: a nudge counts from the step's own time, so the ruler needs no width. Shift
    // once meant a finer step and now means the same one, every authored time being on the grid.
    renderLive();
    const user = userEvent.setup();
    const bar = screen.getByTestId(`step-bar-${STEP_ENTRY}`);
    bar.focus();

    await user.keyboard('{ArrowLeft}');
    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(2 - TIME_GRID_S);

    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBeCloseTo(2, 6);
  });
});

describe('the rename field opts back into selection', () => {
  it('keeps its text selectable although the timeline disables selection', async () => {
    // The timeline sets user-select: none to stop a drag highlighting labels. A field whose
    // own text could not be selected would be unusable, so it must opt back in explicitly
    // rather than relying on the browser's form-control defaults.
    stubLayout();
    renderEditor(fixturePlay, <StepRuler />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Entry pass' }));

    const input = await screen.findByRole('textbox', { name: 'Step name' });

    expect(input.style.userSelect).toBe('text');
  });
});

describe('step label bars', () => {
  const withSteps = (steps: { id: StepId; t: number; name: string; duration?: number }[]) => ({
    ...fixturePlay,
    branches: fixturePlay.branches.filter((b) => b.id === ROOT).map((b) => ({ ...b, steps })),
  });

  it('draws a bar per own step, with a handle and controls', () => {
    renderEditor(fixturePlay, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`step-handle-${STEP_ENTRY}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Entry pass' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Entry pass' })).toBeInTheDocument();
  });

  it('spans to the end of the play when a last step has no duration', () => {
    // The fixture's play is 4s and its only step sits at 2.
    renderEditor(fixturePlay, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).toBe(spanPx(2, 4, LEVEL_1));
  });

  it('spans to the next step when one follows', () => {
    const play = withSteps([
      { id: STEP_ENTRY, t: 1, name: 'Entry pass' },
      { id: 'later' as StepId, t: 2, name: 'Later' },
    ]);
    renderEditor(play, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).toBe(spanPx(1, 2, LEVEL_1));
  });

  it('spans its duration when it has one', () => {
    renderEditor(withSteps([{ id: STEP_ENTRY, t: 2, name: 'Entry pass', duration: 1 }]), <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).toBe(spanPx(2, 3, LEVEL_1));
  });

  it('gives an inherited step a bar with no handle and no controls', async () => {
    // An ancestor's step is shown as a snap mark but belongs to that ancestor.
    renderEditor(
      fixturePlay,
      <>
        <SelectBranch branchId={SWITCH} />
        <StepRuler />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`)).toHaveAttribute('data-inherited', 'true');
    expect(screen.queryByTestId(`step-handle-${STEP_ENTRY}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Entry pass' })).not.toBeInTheDocument();
  });

  it('draws no NaN width for a duration that is not a number', () => {
    // validatePlay reports it, which does not keep it out of the view.
    renderEditor(withSteps([{ id: STEP_ENTRY, t: 2, name: 'Entry pass', duration: Number.NaN }]), <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).not.toContain('NaN');
  });

  it('draws a bar on a play with no duration at all', () => {
    // Every fraction then divides by zero. The ruler must still render.
    const instant = {
      ...fixturePlay,
      branches: fixturePlay.branches
        .filter((b) => b.id === ROOT)
        .map((b) => ({ ...b, tracks: { ball: [] }, steps: [{ id: STEP_ENTRY, t: 0, name: 'Entry pass' }] })),
    };
    renderEditor(instant, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).not.toContain('NaN');
  });

  it('moves a bar by the pointer delta, not by where its centre is', async () => {
    // A bar's LEFT edge is its time, while a marker is centred on its own. Measuring the grab
    // from the centre made the bar jump half a window to the right on the first move.
    // The bar is given the box it really has: a step at t=2 lasting 1s starts 480px along the
    // axis and is 240px wide. Everything else keeps jsdom's own x=0, the track included, so a
    // clientX is a distance along the axis.
    const BAR_LEFT = xOfTime(2, LEVEL_1);
    const BAR_WIDTH = xOfTime(1, LEVEL_1);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const bar = this.getAttribute('data-testid')?.startsWith('step-bar-') === true;
      const left = bar ? BAR_LEFT : 0;
      const width = bar ? BAR_WIDTH : 0;

      return { left, top: 0, width, height: 20, right: left + width, bottom: 20, x: left, y: 0, toJSON: () => ({}) };
    });
    renderEditor(
      withSteps([{ id: STEP_ENTRY, t: 2, name: 'Entry pass', duration: 1 }]),
      <LivePlayback>
        <StepRuler />
      </LivePlayback>,
      { wrapPlayback: false },
    );
    const user = userEvent.setup();
    const bar = screen.getByTestId(`step-bar-${STEP_ENTRY}`);

    // Grabbed 20px into the bar and moved 30px right, so the step lands at 2.1s. Read from the
    // bar's CENTRE instead, the same release would put it at 2.6s — half the bar's width out.
    await user.pointer([
      { keys: '[MouseLeft>]', target: bar, coords: { clientX: BAR_LEFT + 20, clientY: 10 } },
      { target: bar, coords: { clientX: BAR_LEFT + 35, clientY: 10 } },
      { target: bar, coords: { clientX: BAR_LEFT + 50, clientY: 10 } },
      { keys: '[/MouseLeft]', target: bar, coords: { clientX: BAR_LEFT + 50, clientY: 10 } },
    ]);

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBeCloseTo(2.1, 6);
  });

  it('does not retime the step when the duration handle is nudged', async () => {
    // The bar carries a retime gesture and the handle sits inside it, so an arrow key reached
    // both: the label shortened AND the step moved, which is the destructive half — a step's
    // time governs where branches fork and where the scrubber snaps.
    renderEditor(
      withSteps([
        { id: STEP_ENTRY, t: 1, name: 'Entry pass', duration: 1 },
        { id: 'later' as StepId, t: 2, name: 'Later' },
      ]),
      <LivePlayback>
        <StepRuler />
      </LivePlayback>,
      { wrapPlayback: false },
    );
    const user = userEvent.setup();
    screen.getByTestId(`step-handle-${STEP_ENTRY}`).focus();

    await user.keyboard('{ArrowLeft}');

    const step = stepsOfRoot().find((s) => s.id === STEP_ENTRY);
    expect(step?.t).toBe(1);
    expect(step?.duration).toBeLessThan(1);
  });

  it('does not retime the step when a control is nudged', async () => {
    renderEditor(
      withSteps([{ id: STEP_ENTRY, t: 1, name: 'Entry pass' }]),
      <LivePlayback>
        <StepRuler />
      </LivePlayback>,
      { wrapPlayback: false },
    );
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Remove Entry pass' }).focus();

    await user.keyboard('{ArrowLeft}');

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(1);
  });

  it('resizes its own bar when the handle is dragged, and nothing else', async () => {
    // `place` resizes `element.parentElement`. A pointermove bubbling from the handle to the
    // bar re-ran the same gesture with the bar as the target, so the RULER TRACK got the width.
    renderEditor(
      withSteps([
        { id: STEP_ENTRY, t: 1, name: 'Entry pass' },
        { id: 'later' as StepId, t: 2, name: 'Later' },
      ]),
      <LivePlayback>
        <StepRuler />
      </LivePlayback>,
      { wrapPlayback: false },
    );

    await dragElement(screen.getByTestId(`step-handle-${STEP_ENTRY}`));

    // The track fills its window, and the drag must leave it filling it: a width in pixels here
    // is the bar's own width written onto the surface every bar sits on.
    expect(screen.getByTestId('step-ruler-track').style.width).toBe('100%');
  });

  it('clips a long step name instead of letting it leave the bar', () => {
    // A name past the end of the track grows the panel a horizontal scrollbar, which this
    // branch has already fixed twice elsewhere.
    // The clipping now comes from the shared bar's caption, so what is asserted is that the
    // name goes through it: Mantine marks a truncating Text with `data-truncate`, and the rule
    // itself lives in its stylesheet, which jsdom does not load.
    renderEditor(withSteps([{ id: STEP_ENTRY, t: 3.5, name: 'A very long step name indeed' }]), <StepRuler />);
    const name = screen.getByText('A very long step name indeed');

    expect(name).toHaveAttribute('data-truncate', 'end');
    expect(name).toHaveAttribute('data-testid', 'bar-caption');
  });

  it('stops the handle at the next step', async () => {
    renderEditor(
      withSteps([
        { id: STEP_ENTRY, t: 1, name: 'Entry pass' },
        { id: 'later' as StepId, t: 2, name: 'Later' },
      ]),
      <LivePlayback>
        <StepRuler />
      </LivePlayback>,
      { wrapPlayback: false },
    );
    const user = userEvent.setup();
    const handle = screen.getByTestId(`step-handle-${STEP_ENTRY}`);

    // The drag asks for 3.5s, far past where the window may end; the cap is the next step at
    // t=2, so the first step's label window is exactly one second long.
    await user.pointer([
      { keys: '[MouseLeft>]', target: handle, coords: { clientX: 0, clientY: 0 } },
      { target: handle, coords: { clientX: xOfTime(2.5, LEVEL_1), clientY: 0 } },
      { target: handle, coords: { clientX: xOfTime(3.5, LEVEL_1), clientY: 0 } },
      { keys: '[/MouseLeft]', target: handle, coords: { clientX: xOfTime(3.5, LEVEL_1), clientY: 0 } },
    ]);

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.duration).toBeCloseTo(1, 6);
  });
});
