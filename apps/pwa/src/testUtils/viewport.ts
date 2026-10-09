import { vi } from 'vitest';

/**
 * Makes `window.matchMedia` answer `(min-width: Nem)` queries for a viewport of the given width in px
 * (1em = 16px). jsdom has no layout, so this is the only way a test can exercise a breakpoint-driven
 * default; it proves the logic, not how the page looks.
 */
export function stubViewportWidth(widthPx: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)em/.exec(query);
    return {
      matches: min !== null && widthPx >= Number(min[1]) * 16,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
  });
}
