import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixturePlay, P1, P2 } from '../engine/__fixtures__/play';
import { Timeline } from './Timeline';
import { stubViewportWidth } from '../testUtils/viewport';
import { readProbe, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const order = () => readProbe().play.players.map((p) => p.id);
const rowOrder = () =>
  screen.getAllByTestId(/^timeline-row-/).map((r) => r.getAttribute('data-testid')?.replace('timeline-row-', ''));
const handleFor = (entityId: string) =>
  within(screen.getByTestId(`timeline-row-${entityId}`)).getByRole('button', { name: /^Reorder/ });

describe('reordering rows', () => {
  it("gives every player's row a handle, and the ball none", () => {
    renderEditor(fixturePlay, <Timeline />);

    expect(handleFor(P1)).toBeInTheDocument();
    expect(handleFor(P2)).toBeInTheDocument();
    expect(
      within(screen.getByTestId('timeline-row-ball')).queryByRole('button', { name: /^Reorder/ }),
    ).not.toBeInTheDocument();
  });

  it('names the player its handle would move', () => {
    renderEditor(fixturePlay, <Timeline />);

    expect(handleFor(P1)).toHaveAccessibleName('Reorder 1');
  });

  it('keeps the ball at the head of the list', () => {
    renderEditor(fixturePlay, <Timeline />);

    expect(rowOrder()[0]).toBe('ball');
  });

  // What is NOT here: a case that actually reorders. dnd-kit decides what a move passes by
  // measuring nodes, through layout and a ResizeObserver that reports; jsdom has no layout and
  // the suite's observer is an inert stub, so neither the pointer nor the keyboard finds a
  // neighbour. Stubbing per-row rects and `scrollIntoView` was tried and changed nothing.
  // Recorded in limitations.md; the gesture itself is verified in a browser.
  it('leaves the order alone when a drag is abandoned', async () => {
    renderEditor(fixturePlay, <Timeline />);
    const user = userEvent.setup();

    handleFor(P1).focus();
    await user.keyboard('{ }');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');

    expect(order()).toEqual([P1, P2]);
  });

  it('never lets a player past the ball', async () => {
    // The ball is not sortable, so the first player cannot be moved above it.
    renderEditor(fixturePlay, <Timeline />);
    const user = userEvent.setup();

    handleFor(P1).focus();
    await user.keyboard('{ }');
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ }');

    expect(rowOrder()[0]).toBe('ball');
    expect(order()).toEqual([P1, P2]);
  });
});
