import '@testing-library/jest-dom/vitest';
import './i18n/i18n';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mantine's SegmentedControl (FloatingIndicator) observes its container; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

// jsdom implements no scrolling, and dnd-kit's keyboard sensor brings the row it picks up into
// view on the first key press. Without this it throws before a drag ever starts.
Element.prototype.scrollIntoView ??= () => {};
