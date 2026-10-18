import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

describe('safeNext', () => {
  it('keeps an in-app path, with its query and hash', () => {
    expect(safeNext('/play/p1?save=1#top')).toBe('/play/p1?save=1#top');
  });

  it('sends anything on another site home', () => {
    expect(safeNext('https://evil.example/steal')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
  });

  it('goes home with nothing to go on', () => {
    expect(safeNext(null)).toBe('/');
  });

  // It is called while rendering the sign-in screens, and the app has no error boundary: a
  // thrown TypeError would unmount the whole tree to a blank page.
  it('goes home, rather than throwing, on a candidate no URL parser accepts', () => {
    expect(safeNext('https://[')).toBe('/');
    expect(safeNext('http://%')).toBe('/');
  });
});
