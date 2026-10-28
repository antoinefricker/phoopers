import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepId } from '../engine';
import { fixturePlay, ROOT } from '../engine/__fixtures__/play';
import { enterEditMode, leaveEditMode, renderEditor } from '../editor/testUtils/renderEditor';
import { stubViewportWidth } from '../testUtils/viewport';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlaybackTransport } from './PlaybackTransport';
import { PlayView } from './PlayView';

// A system created 8 s long whose last keyframe is at 4 s: the timeline is 8 s, the movement 4 s.
const floored = { ...fixturePlay, duration: 8 };

beforeEach(() => {
  stubViewportWidth(1440);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

const scrubber = () => screen.getByRole('slider');
const max = () => Number(scrubber().getAttribute('aria-valuemax'));
const value = () => Number(scrubber().getAttribute('aria-valuenow'));
const toEnd = async () => {
  scrubber().focus();
  await userEvent.keyboard('{End}');
};

describe('where the playhead may go', () => {
  it('stops at the end of the last label when that is later than the last keyframe', () => {
    const labelled = {
      ...floored,
      branches: floored.branches.map((b) =>
        b.id === ROOT ? { ...b, steps: [{ id: 'late' as StepId, t: 3, name: 'Late', duration: 3 }] } : b,
      ),
    };
    renderEditor(labelled, <PlayView />, { wrapPlayback: false });

    // The last keyframe is at 4 s and the label's window ends at 6 s.
    expect(max()).toBe(6);
  });

  it('stops at the last keyframe while watching, though the system is longer', () => {
    renderEditor(floored, <PlayView />, { wrapPlayback: false });

    expect(max()).toBe(4);
  });

  it('reaches the whole timeline while authoring, where a keyframe past the last is written', async () => {
    renderEditor(floored, <PlayView />, { wrapPlayback: false });

    await enterEditMode();

    expect(max()).toBe(8);
  });

  it('takes the playhead to the last keyframe, and no further, from the end key', async () => {
    renderEditor(floored, <PlayView />, { wrapPlayback: false });

    await toEnd();

    await waitFor(() => expect(value()).toBe(4));
  });

  it('brings a playhead left past the last keyframe back to it when authoring is left', async () => {
    renderEditor(floored, <PlayView />, { wrapPlayback: false });
    await enterEditMode();
    await toEnd();
    await waitFor(() => expect(value()).toBe(8));

    await leaveEditMode();

    await waitFor(() => expect(value()).toBe(4));
    expect(max()).toBe(4);
  });

  it('watches the same way with no editor around, as the transport does on its own', () => {
    render(
      <MantineProvider>
        <PlaybackContextProvider play={floored}>
          <PlaybackTransport />
        </PlaybackContextProvider>
      </MantineProvider>,
    );

    expect(max()).toBe(4);
  });
});
