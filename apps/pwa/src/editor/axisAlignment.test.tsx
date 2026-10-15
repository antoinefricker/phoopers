import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { SCROLLBAR_GUTTER_PX } from '../play2d/transportMath';
import { stubViewportWidth } from '../testUtils/viewport';
import { renderEditor } from './testUtils/renderEditor';

beforeEach(() => stubViewportWidth(1440));

const enterEditMode = () => userEvent.click(screen.getByRole('radio', { name: 'Edit' }));

// The scrubber, the step ruler and the keyframe tracks are one time axis drawn on three
// surfaces. Only the tracks scroll, so only they used to lose width to the scrollbar — and the
// scrubber above them then ran past the last marker by its width. Both ends of the axis have to
// reserve the gutter, and reserve it whether or not the rows are overflowing: a gutter that
// came and went with the bar would shift the axis under the coach's pointer as rows are added.
describe('the time axis across the transport and the tracks', () => {
  it('reserves the same right-hand gutter on both surfaces', async () => {
    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    const transport = screen.getByTestId('transport-row');
    const viewport = screen.getByTestId('timeline-viewport');

    expect(transport.style.paddingRight).toBe(`${SCROLLBAR_GUTTER_PX}px`);
    expect(viewport.style.paddingRight).toBe(transport.style.paddingRight);
  });

  it('does not leave the offset to the scrollbar being there', async () => {
    // `offsetScrollbars` pads only while the bar is shown — `[data-vertical-hidden]` clears it —
    // so the tracks would be the full width with few rows and short by the scrollbar with many,
    // while the scrubber never moved. Reserving it in our own style is what makes it constant.
    const { container } = renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });
    await enterEditMode();

    expect(container.querySelector('[data-offset-scrollbars]')).toBeNull();
  });
});
