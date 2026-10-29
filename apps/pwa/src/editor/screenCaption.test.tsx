import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Play } from '../engine';
import { fixturePlay, P2, ROOT, SCREEN_1 } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { enterEditMode, renderEditor } from './testUtils/renderEditor';
import { Timeline } from './Timeline';

beforeEach(() => stubViewportWidth(1440));

const screenAt = (t: number): Play => ({
  ...fixturePlay,
  branches: fixturePlay.branches.map((b) =>
    b.id === ROOT ? { ...b, screens: b.screens.map((s) => ({ ...s, t })) } : b,
  ),
});

// The padding in front of a screen bar's caption, in the P2 row (the screener's).
const captionStart = () => {
  const bar = screen.getByTestId(`screen-bar-${SCREEN_1}`);
  const row = bar.closest('[data-testid^="timeline-track-"]');
  expect(row).toHaveAttribute('data-testid', `timeline-track-${P2}`);

  return bar.querySelector<HTMLElement>('[data-testid="bar-caption"]')?.parentElement?.style.paddingLeft;
};

describe('where the caption of a screen bar starts', () => {
  it('clears the keyframe marker at the start of the bar, which sits above it', () => {
    // The fixture's P2 has a keyframe at t = 2 and the screen is set at t = 2: the marker fills
    // the cell from there, 24px, and the caption starts after it with a 4px gap.
    renderEditor(fixturePlay, <Timeline />);

    expect(captionStart()).toBe('28px');
  });

  it('keeps the bar own padding when no keyframe starts within a cell of the bar', () => {
    // P2 has keyframes at 0, 2 and 4: nothing is near a screen at 3.
    renderEditor(screenAt(3), <Timeline />);

    expect(captionStart()).toBe('8px');
  });

  it('follows the width of a cell at each zoom level', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    const bar = () => screen.getByTestId(`screen-bar-${SCREEN_1}`);
    const start = () =>
      bar().querySelector<HTMLElement>('[data-testid="bar-caption"]')?.parentElement?.style.paddingLeft;
    const zoomOut = () => fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));

    const seen = [start()];
    for (let i = 0; i < 3; i++) {
      zoomOut();
      seen.push(start());
    }

    // A cell is 24, 18, 12 and 6 px, and the gap is 4.
    expect(seen).toEqual(['28px', '22px', '16px', '10px']);
  });
});
