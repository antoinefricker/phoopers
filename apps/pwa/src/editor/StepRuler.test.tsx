import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StepId } from '../engine';
import { fixturePlay, ROOT, STEP_ENTRY, SWITCH } from '../engine/__fixtures__/play';
import { StepRuler } from './StepRuler';
import type { ReactNode } from 'react';
import { PlaybackContextProvider } from '../play2d/PlaybackContextProvider';
import { dragElement, readProbe, renderEditor, SelectBranch } from './testUtils/renderEditor';
import { useEditorContext } from './useEditorContext';

// The shared harness hands the playback provider the INITIAL play, so a step added in a test would
// never reach the ruler. This feeds it the editor's live play, as the app does.
function LivePlayback({ children }: { children: ReactNode }) {
  const { play } = useEditorContext();

  return <PlaybackContextProvider play={play}>{children}</PlaybackContextProvider>;
}

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

  it('renders one tick per step, labelled with its name, plus the add button', () => {
    renderEditor(fixturePlay, <StepRuler />);
    const ruler = screen.getByTestId('step-ruler');

    expect(within(ruler).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('Entry pass')).toBeInTheDocument();
  });

  it('places a tick at its fraction of the duration', () => {
    renderEditor(fixturePlay, <StepRuler />);

    // Step at t=2 of a 4s play.
    expect(screen.getByRole('button', { name: 'Entry pass' }).style.left).toBe('50%');
  });

  it('adds a step at the current time, with a default name', async () => {
    renderEditor(fixturePlay, <StepRuler />);
    const before = stepsOfRoot().length;

    await userEvent.click(screen.getByRole('button', { name: 'Add step' }));

    expect(stepsOfRoot()).toHaveLength(before + 1);
    expect(stepsOfRoot().every((s) => Number.isFinite(s.t))).toBe(true);
    expect(stepsOfRoot().map((s) => s.name)).toContain('Step 2');
  });

  it('renames a step', async () => {
    stubLayout();
    renderEditor(fixturePlay, <StepRuler />);

    await userEvent.click(screen.getByText('Entry pass'));
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

    await userEvent.click(screen.getByText('Entry pass'));
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

    await userEvent.click(screen.getByText(added.name));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(stepsOfRoot().map((s) => s.id)).toEqual([STEP_ENTRY]);
  });

  it('retimes a step by dragging its tick, and the drag demonstrably acted', async () => {
    renderEditor(fixturePlay, <StepRuler />);

    await dragElement(screen.getByRole('button', { name: 'Entry pass' }));

    // No layout: the drop maps to t=0, the root branch has no fork floor above 0.
    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(0);
  });

  it('opens no editor after a drag', async () => {
    renderEditor(fixturePlay, <StepRuler />);
    const tick = screen.getByRole('button', { name: 'Entry pass' });
    expect(tick).toHaveAttribute('aria-expanded', 'false');

    await dragElement(tick);

    // The click the browser fires on release must not also open the editor.
    expect(screen.getByRole('button', { name: 'Entry pass' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('floors a step at the fork time of the branch that OWNS it, not the one being viewed', async () => {
    renderEditor(
      fixturePlay,
      <>
        <SelectBranch branchId={SWITCH} />
        <StepRuler />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));

    // Viewing SWITCH (forked at 2), the root's step is still the root's: its floor is 0. The raw
    // drop is t=0, so a floor taken from the viewed branch would hold it at 2.
    await dragElement(screen.getByRole('button', { name: 'Entry pass' }));

    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(0);
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
    await dragElement(screen.getByRole('button', { name: 'Switch step' }));

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

    await dragElement(screen.getByRole('button', { name: 'Entry pass' }));

    // SWITCH forks from this step and its first keyframe is at 2: moving the step later would
    // put that keyframe before its own fork.
    expect(stepsOfRoot().find((s) => s.id === STEP_ENTRY)?.t).toBe(2);
  });
});
