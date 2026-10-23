import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimelineViewportContextProvider } from './TimelineViewportContextProvider';
import { useTimelineViewportContext, type TimelineViewportContextValue } from './useTimelineViewportContext';

// The probe prints what the assertions read and hands the live value out for driving it.
const live: { current: TimelineViewportContextValue | null } = { current: null };

function Probe() {
  const latest = useTimelineViewportContext();

  useEffect(() => {
    live.current = latest;
  });

  return (
    <div>
      <span data-testid="px">{latest.pxPerCell}</span>
      <span data-testid="in">{String(latest.canZoomIn)}</span>
      <span data-testid="out">{String(latest.canZoomOut)}</span>
      <span data-testid="width">{latest.contentWidthPx}</span>
      <span data-testid="scroll">{latest.scrollLeft}</span>
    </div>
  );
}

function mount(duration = 18) {
  render(
    <TimelineViewportContextProvider duration={duration}>
      <Probe />
    </TimelineViewportContextProvider>,
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

describe('the timeline viewport', () => {
  it('opens at the finest level, where it cannot go finer', () => {
    mount();

    expect(text('px')).toBe('24');
    expect(text('in')).toBe('false');
    expect(text('out')).toBe('true');
  });

  it('steps outwards and back along the ladder', () => {
    mount();

    act(() => live.current!.zoomOut());
    expect(text('px')).toBe('18');
    act(() => live.current!.zoomOut());
    expect(text('px')).toBe('12');
    act(() => live.current!.zoomOut());
    expect(text('px')).toBe('6');
    expect(text('out')).toBe('false');

    act(() => live.current!.zoomIn());
    expect(text('px')).toBe('12');
  });

  it('is as wide as the play is long at the current level', () => {
    mount(18);

    expect(text('width')).toBe('4320');
    act(() => live.current!.zoomOut());
    act(() => live.current!.zoomOut());
    act(() => live.current!.zoomOut());
    expect(text('width')).toBe('1080');
  });

  it('refuses a scroll past either end', () => {
    mount(18);
    // jsdom reports no layout, so the window's width is given the way the real surface would.
    act(() => live.current!.setViewportWidthPx(1000));

    act(() => live.current!.scrollTo(-10));
    expect(text('scroll')).toBe('0');

    act(() => live.current!.scrollTo(99999));
    expect(text('scroll')).toBe(String(4320 - 1000));
  });

  it('allows a scroll up to the whole content while the window is unmeasured', () => {
    // jsdom and a collapsed panel both report zero width, so the window counts as no wide at
    // all and the whole content is reachable until the first real measure arrives.
    mount(18);

    act(() => live.current!.scrollTo(500));
    expect(text('scroll')).toBe('500');
  });

  it('throws when used outside its provider', () => {
    // React logs the error it rethrows; keep the run's output clean.
    const log = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Probe />)).toThrow(/useTimelineViewportContext.*TimelineViewportContextProvider/);
    } finally {
      console.error = log;
    }
  });
});
