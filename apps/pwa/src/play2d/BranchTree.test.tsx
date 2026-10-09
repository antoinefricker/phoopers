import { useEffect, useRef } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Branch, BranchId, Play } from '../engine';
import { hornsPlay } from '../samples/horns';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { BranchTree } from './BranchTree';
import { branchTreeData } from './branchTreeData';
import { usePlaybackContext } from './usePlaybackContext';

const branch = (id: string, parentId: string | null, name: string): Branch => ({
  id: id as BranchId,
  parentId: parentId as BranchId | null,
  forkStepId: null,
  name,
  tracks: { ball: [] },
  steps: [],
  screens: [],
});

const withBranches = (branches: Branch[], rootBranchId = 'a'): Play => ({
  ...hornsPlay,
  rootBranchId: rootBranchId as BranchId,
  branches,
});

describe('branchTreeData', () => {
  it('nests a child branch under its parent', () => {
    const [root] = branchTreeData(hornsPlay);

    expect(root?.value).toBe(hornsPlay.rootBranchId);
    expect(root?.children?.map((child) => child.value)).toEqual(
      hornsPlay.branches.filter((b) => b.parentId === hornsPlay.rootBranchId).map((b) => b.id),
    );
  });

  it('labels each node with the branch name', () => {
    const [root] = branchTreeData(hornsPlay);

    expect(root?.label).toBe('Base');
  });

  it('nests branches more than one level deep, keeping siblings apart', () => {
    const play = withBranches([
      branch('a', null, 'A'),
      branch('b', 'a', 'B'),
      branch('c', 'b', 'C'),
      branch('d', 'c', 'D'),
      branch('e', 'a', 'E'),
    ]);

    const [root] = branchTreeData(play);

    expect(root?.children?.map((n) => n.value)).toEqual(['b', 'e']);
    expect(root?.children?.[0]?.children?.[0]?.value).toBe('c');
    expect(root?.children?.[0]?.children?.[0]?.children?.[0]?.value).toBe('d');
    expect(root?.children?.[1]?.children).toEqual([]);
  });

  it('terminates on a parent cycle, leaving the unreachable branches out', () => {
    const play = withBranches([branch('a', null, 'A'), branch('x', 'y', 'X'), branch('y', 'x', 'Y')]);

    expect(branchTreeData(play).map((n) => n.value)).toEqual(['a']);
  });

  it('terminates when a duplicated id makes a branch its own descendant', () => {
    const play = withBranches([branch('a', null, 'A'), branch('a', 'a', 'A again')]);

    expect(branchTreeData(play)).toEqual([{ value: 'a', label: 'A', children: [] }]);
  });
});

function Probe() {
  const { branchId, timeline, isPlaying, play, seek, subscribe } = usePlaybackContext();
  const timeRef = useRef<HTMLSpanElement>(null);
  // seek() does not re-render stable-context consumers, so the time is written by
  // subscription. Reading currentTimeRef during render would show a stale value.
  useEffect(
    () =>
      subscribe((t) => {
        if (timeRef.current !== null) timeRef.current.textContent = String(t);
      }),
    [subscribe],
  );
  return (
    <>
      <span data-testid="branch-id">{branchId}</span>
      <span data-testid="timeline-branch">{timeline.branchId}</span>
      <span data-testid="playing">{String(isPlaying)}</span>
      <span data-testid="time" ref={timeRef}>
        0
      </span>
      <button type="button" onClick={play}>
        probe-play
      </button>
      <button type="button" onClick={() => seek(3)}>
        probe-seek
      </button>
    </>
  );
}

const renderTree = (play: Play = hornsPlay) =>
  render(
    <MantineProvider>
      <PlaybackContextProvider play={play}>
        <BranchTree play={play} />
        <Probe />
      </PlaybackContextProvider>
    </MantineProvider>,
  );

const child = hornsPlay.branches.find((b) => b.parentId !== null);
if (child === undefined) throw new Error('fixture needs a child branch');
const rootName = 'Base';

describe('BranchTree', () => {
  beforeEach(() => {
    // Frames never fire: the test drives the clock only through seek, so time is exact.
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders every branch name', () => {
    renderTree();

    for (const b of hornsPlay.branches) {
      expect(screen.getByText(b.name)).toBeInTheDocument();
    }
  });

  it('renders nested branches at every depth', () => {
    const play = withBranches([branch('a', null, 'A'), branch('b', 'a', 'B'), branch('c', 'b', 'C')]);
    renderTree(play);

    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('switches the timeline when a branch is selected', async () => {
    const user = userEvent.setup();
    renderTree();
    expect(screen.getByTestId('branch-id')).toHaveTextContent(hornsPlay.rootBranchId);
    expect(screen.getByTestId('timeline-branch')).toHaveTextContent(hornsPlay.rootBranchId);

    await user.click(screen.getByText(child.name));

    expect(screen.getByTestId('branch-id')).toHaveTextContent(child.id);
    expect(screen.getByTestId('timeline-branch')).toHaveTextContent(child.id);
  });

  it('marks only the branch being watched as current', async () => {
    const user = userEvent.setup();
    renderTree();
    const current = () => screen.getAllByRole('button', { current: true });

    expect(current().map((el) => el.textContent)).toEqual([rootName]);

    await user.click(screen.getByText(child.name));

    expect(current().map((el) => el.textContent)).toEqual([child.name]);
  });

  it('selects from the keyboard', async () => {
    const user = userEvent.setup();
    renderTree();

    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: child.name })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('branch-id')).toHaveTextContent(child.id);
  });

  it('selects a branch that has children with the Space key', async () => {
    const user = userEvent.setup();
    renderTree();
    await user.click(screen.getByText(child.name));
    expect(screen.getByTestId('branch-id')).toHaveTextContent(child.id);

    screen.getByRole('button', { name: rootName }).focus();
    await user.keyboard(' ');

    expect(screen.getByTestId('branch-id')).toHaveTextContent(hornsPlay.rootBranchId);
  });

  it('exposes the hierarchy as nested lists', () => {
    const play = withBranches([
      branch('a', null, 'A'),
      branch('b', 'a', 'B'),
      branch('c', 'b', 'C'),
      branch('e', 'a', 'E'),
    ]);
    renderTree(play);

    const nav = screen.getByRole('navigation', { name: 'Play branches' });
    const [top] = within(nav).getAllByRole('list');
    const rootItem = within(top as HTMLElement).getAllByRole('listitem')[0] as HTMLElement;
    const children = within(within(rootItem).getAllByRole('list')[0] as HTMLElement);

    expect(within(rootItem).getByRole('button', { name: 'A' })).toBeInTheDocument();
    // B and E are A's children; C is inside B's own nested list, not a sibling of B.
    expect(
      Array.from((children.getAllByRole('listitem')[0] as HTMLElement).closest('ul')?.children ?? []).map(
        (li) => li.querySelector('button')?.textContent,
      ),
    ).toEqual(['B', 'E']);
    const bItem = children.getAllByRole('listitem')[0] as HTMLElement;
    expect(within(bItem).getByRole('button', { name: 'C' })).toBeInTheDocument();
  });

  it('restarts from the shared opening on a switch, without stopping playback', async () => {
    const user = userEvent.setup();
    renderTree();
    await user.click(screen.getByText('probe-seek'));
    await user.click(screen.getByText('probe-play'));
    expect(screen.getByTestId('playing')).toHaveTextContent('true');
    expect(screen.getByTestId('time')).toHaveTextContent('3');

    await user.click(screen.getByText(child.name));

    expect(screen.getByTestId('branch-id')).toHaveTextContent(child.id);
    expect(screen.getByTestId('playing')).toHaveTextContent('true');
    expect(screen.getByTestId('time')).toHaveTextContent('0');
  });

  it('restarts a paused playhead too', async () => {
    const user = userEvent.setup();
    renderTree();
    await user.click(screen.getByText('probe-seek'));

    await user.click(screen.getByText(child.name));

    expect(screen.getByTestId('playing')).toHaveTextContent('false');
    expect(screen.getByTestId('time')).toHaveTextContent('0');
  });

  it('leaves the playhead alone when the current branch is clicked again', async () => {
    const user = userEvent.setup();
    renderTree();
    await user.click(screen.getByText('probe-seek'));

    await user.click(screen.getByText(rootName));

    expect(screen.getByTestId('time')).toHaveTextContent('3');
  });
});
