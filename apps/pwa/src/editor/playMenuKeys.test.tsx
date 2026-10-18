import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixturePlay } from '../engine/__fixtures__/play';
import { PlayView } from '../play2d/PlayView';
import { renderEditor } from './testUtils/renderEditor';

/**
 * The system menu keeps both of its dialogs mounted and remounts each one by changing its `key`
 * on every open. Both counters start at 0, so keying them by the bare count gave two siblings
 * the key `0` and React warned on every render of the editor. The keys are prefixed per dialog;
 * this holds that, and any other duplicate key the editor grows, to a failing test rather than
 * a line in the console nobody reads.
 */
describe('the editor renders no duplicate React keys', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mounts without React complaining about a duplicate key', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderEditor(fixturePlay, <PlayView />, { wrapPlayback: false });

    const duplicates = errors.mock.calls.filter(([message]) =>
      String(message).includes('two children with the same key'),
    );
    expect(duplicates).toEqual([]);
  });
});
