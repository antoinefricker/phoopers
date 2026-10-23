import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fixturePlay, P1 } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { stubViewportWidth } from '../testUtils/viewport';
import { enterEditMode, renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const zoomIn = () => screen.getByRole('button', { name: 'Zoom in' });
const zoomOut = () => screen.getByRole('button', { name: 'Zoom out' });
// What a coach sees widen: the width of one row's track content.
const trackWidth = () => screen.getByTestId(`timeline-window-${P1}-content`).style.width;

const renderTimeline = async () => {
  renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
  await enterEditMode();
};

describe('the zoom control', () => {
  it('cannot go finer than the level it opens at', async () => {
    await renderTimeline();

    expect(zoomIn()).toBeDisabled();
    expect(zoomOut()).toBeEnabled();
  });

  it('widens the view a step at a time', async () => {
    await renderTimeline();
    const opening = parseFloat(trackWidth());

    // Each level is a fixed fraction of the opening one (24, 18, 12, 6 px per cell).
    for (const px of [18, 12, 6]) {
      fireEvent.click(zoomOut());
      expect(parseFloat(trackWidth())).toBeCloseTo((opening * px) / 24);
    }
  });

  it('stops at the widest level', async () => {
    await renderTimeline();

    for (let i = 0; i < 3; i++) fireEvent.click(zoomOut());

    expect(zoomOut()).toBeDisabled();
    expect(zoomIn()).toBeEnabled();
  });

  it('is absent while watching', () => {
    // Watching is the mode the editor opens in, and the timeline is not rendered there.
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

    expect(screen.queryByRole('button', { name: 'Zoom out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument();
  });
});
