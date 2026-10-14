import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StepId } from '../engine';
import { fixturePlay, ROOT, STEP_ENTRY, SWITCH } from '../engine/__fixtures__/play';
import { StepRuler } from './StepRuler';
import { dragElement, LivePlayback, readProbe, renderEditor, SelectBranch } from './testUtils/renderEditor';

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

  it('renders one bar per step, labelled with its name, plus the add button', () => {
    renderEditor(fixturePlay, <StepRuler />);
    const ruler = screen.getByTestId('step-ruler');

    // Add step, the duration handle, edit and remove.
    expect(within(ruler).getAllByRole('button')).toHaveLength(4);
    expect(screen.getByText('Entry pass')).toBeInTheDocument();
  });

  it('starts a bar at its fraction of the duration', () => {
    renderEditor(fixturePlay, <StepRuler />);

    // Step at t=2 of a 4s play.
    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.left).toBe('50%');
  });

  it('adds a step at the current time, with a default name', async () => {
    renderEditor(fixturePlay, <StepRuler />);
    const before = stepsOfRoot().length;

    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));

    expect(stepsOfRoot()).toHaveLength(before + 1);
    expect(stepsOfRoot().every((s) => Number.isFinite(s.t))).toBe(true);
    expect(stepsOfRoot().map((s) => s.name)).toContain('Step 2');
  });

  it('adds no step before the fork, and says nothing', async () => {
    renderEditor(
      fixturePlay,
      <>
        <SelectBranch branchId={SWITCH} />
        <StepRuler />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));
    const stepsOfSwitch = () => readProbe().play.branches.find((b) => b.id === SWITCH)?.steps ?? [];
    const rulerBefore = screen.getByTestId('step-ruler').innerHTML;

    // The playhead is at 0 and SWITCH forks at 2. Recorded in limitations.md.
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));

    expect(stepsOfSwitch()).toHaveLength(0);
    expect(screen.getByTestId('step-ruler').innerHTML).toBe(rulerBefore);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    stubLayout();
    renderLive();
    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));
    const added = stepsOfRoot().find((s) => s.id !== STEP_ENTRY);
    if (added === undefined) throw new Error('expected an added step');

    await userEvent.click(screen.getByRole('button', { name: `Edit ${added.name}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(stepsOfRoot().map((s) => s.id)).toEqual([STEP_ENTRY]);
  });

  it('retimes a step by dragging its bar, and the drag demonstrably acted', async () => {
    renderEditor(fixturePlay, <StepRuler />);

    await dragElement(screen.getByTestId(`step-bar-${STEP_ENTRY}`));

    // No layout: the drop maps to t=0, the root branch has no fork floor above 0.
    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(0);
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
    // A 100px ruler over a 4s play: the release at clientX 120 clamps to the end, t=4.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    renderEditor(fixturePlay, <StepRuler />);

    await dragElement(screen.getByTestId(`step-bar-${STEP_ENTRY}`));

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
    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(1.5);

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

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).toBe('50%');
  });

  it('spans to the next step when one follows', () => {
    const play = withSteps([
      { id: STEP_ENTRY, t: 1, name: 'Entry pass' },
      { id: 'later' as StepId, t: 2, name: 'Later' },
    ]);
    renderEditor(play, <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).toBe('25%');
  });

  it('spans its duration when it has one', () => {
    renderEditor(withSteps([{ id: STEP_ENTRY, t: 2, name: 'Entry pass', duration: 1 }]), <StepRuler />);

    expect(screen.getByTestId(`step-bar-${STEP_ENTRY}`).style.width).toBe('25%');
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
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const bar = this.getAttribute('data-testid')?.startsWith('step-bar-') === true;
      const left = bar ? 50 : 0;
      const width = bar ? 25 : 100;

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

    // Grab 5px into the bar and move 10px right: a 100px track over 4s, so 0.4s.
    await user.pointer([
      { keys: '[MouseLeft>]', target: bar, coords: { clientX: 55, clientY: 10 } },
      { target: bar, coords: { clientX: 60, clientY: 10 } },
      { target: bar, coords: { clientX: 65, clientY: 10 } },
      { keys: '[/MouseLeft]', target: bar, coords: { clientX: 65, clientY: 10 } },
    ]);

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBeCloseTo(2.5, 6);
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

    expect(screen.getByTestId('step-ruler-track').style.width).toBe('');
  });

  it('clips a long step name instead of letting it leave the bar', () => {
    // A name past the end of the track grows the panel a horizontal scrollbar, which this
    // branch has already fixed twice elsewhere.
    renderEditor(withSteps([{ id: STEP_ENTRY, t: 3.5, name: 'A very long step name indeed' }]), <StepRuler />);
    const name = screen.getByText('A very long step name indeed');

    expect(name.style.overflow).toBe('hidden');
    expect(name.style.textOverflow).toBe('ellipsis');
  });

  it('stops the handle at the next step', async () => {
    stubLayout();
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

    // The drag asks for the far right of the track; the cap is the next step at t=2.
    await dragElement(screen.getByTestId(`step-handle-${STEP_ENTRY}`));

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.duration).toBeCloseTo(1, 6);
  });
});
