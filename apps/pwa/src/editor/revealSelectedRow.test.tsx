import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixturePlay, P1, P2 } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { Timeline } from './Timeline';
import { enterEditMode, renderEditor } from './testUtils/renderEditor';

afterEach(() => vi.restoreAllMocks());

// jsdom lays nothing out. The window is 100px tall, row P1 sits inside it and row P2 below it, so
// bringing P2 into view means scrolling by the 80px that hang past the window's bottom edge.
const stubLayout = (rows: Record<string, { top: number; bottom: number }>) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const id = this.getAttribute('data-testid') ?? '';
    const box = id === 'timeline-viewport' ? { top: 0, bottom: 100 } : (rows[id] ?? { top: 0, bottom: 0 });

    return { ...box, left: 0, right: 0, width: 0, height: box.bottom - box.top, x: 0, y: box.top, toJSON: () => ({}) };
  });

const renderTimeline = () => {
  renderEditor(fixturePlay, <Timeline />);
  const viewport = screen.getByTestId('timeline-viewport');
  // The offset is the thing being written, so give it somewhere to be written to.
  Object.defineProperty(viewport, 'scrollTop', { value: 0, writable: true, configurable: true });

  return viewport;
};

describe('bringing the selected row into view', () => {
  it('scrolls a row below the window just far enough to show it whole', async () => {
    stubLayout({ [`timeline-row-${P1}`]: { top: 10, bottom: 50 }, [`timeline-row-${P2}`]: { top: 140, bottom: 180 } });
    const viewport = renderTimeline();

    await userEvent.click(screen.getByTestId(`row-name-${P2}`));

    expect(viewport.scrollTop).toBe(80);
  });

  it('leaves the view alone when the row is already in sight', async () => {
    stubLayout({ [`timeline-row-${P1}`]: { top: 10, bottom: 50 }, [`timeline-row-${P2}`]: { top: 140, bottom: 180 } });
    const viewport = renderTimeline();

    await userEvent.click(screen.getByTestId(`row-name-${P1}`));

    expect(viewport.scrollTop).toBe(0);
  });

  it('does the same for a token pressed on the court, which is where a coach clicks', async () => {
    stubLayout({ [`timeline-row-${P2}`]: { top: 140, bottom: 180 } });
    stubViewportWidth(1440);
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const viewport = screen.getByTestId('timeline-viewport');
    Object.defineProperty(viewport, 'scrollTop', { value: 0, writable: true, configurable: true });

    await userEvent.click(screen.getByTestId(`edit-token-${P2}`));

    expect(viewport.scrollTop).toBe(80);
  });

  it('brings the row back when the same entity is selected again after scrolling away', async () => {
    stubLayout({ [`timeline-row-${P2}`]: { top: 140, bottom: 180 } });
    const viewport = renderTimeline();
    await userEvent.click(screen.getByTestId(`row-name-${P2}`));
    expect(viewport.scrollTop).toBe(80);

    viewport.scrollTop = 0;
    await userEvent.click(screen.getByTestId(`row-name-${P2}`));

    expect(viewport.scrollTop).toBe(80);
  });
});
