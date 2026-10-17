import { describe, expect, it } from 'vitest';
import { fixturePlay } from './__fixtures__/play';
import { extentOf } from './extent';

describe('extentOf', () => {
  it('defaults to the full court when the play does not say', () => {
    expect(extentOf(fixturePlay)).toBe('full');
  });

  it('reads the play when it does', () => {
    expect(extentOf({ ...fixturePlay, extent: 'half' })).toBe('half');
  });
});
