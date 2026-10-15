import { useLayoutEffect, useRef } from 'react';
import { Text } from '@mantine/core';
import { usePlaybackContext } from './usePlaybackContext';
import { stepLabelAt } from './transportMath';

/**
 * Names the step the playhead has reached, over the court.
 *
 * It writes its own text through a ref rather than rendering from state, the way `TokenLayer`
 * writes its transforms: the court does no per-frame React work, and a caption that re-rendered
 * with the clock would drag the whole court panel along at the frame rate. The write is skipped
 * unless the name actually changed, which over a play is a handful of times.
 *
 * Nothing is named before the first step — a play can open on movement that belongs to no step
 * yet — nor once a step's display window has closed, so the caption is empty there rather than
 * carrying a placeholder.
 */
export function StepCaption() {
  const { timeline, subscribe, currentTimeRef } = usePlaybackContext();
  const ref = useRef<HTMLParagraphElement | null>(null);

  // Layout effect so the first paint already names the right step, rather than flashing empty.
  useLayoutEffect(() => {
    const paint = (t: number) => {
      const node = ref.current;
      if (node === null) return;
      const name = stepLabelAt(t, timeline.steps, timeline.duration)?.name ?? '';
      if (node.textContent === name) return;

      node.textContent = name;
      // The caption carries a background and padding, so an empty one would sit on the floor
      // as a blank tile instead of disappearing.
      node.style.display = name === '' ? 'none' : '';
    };

    paint(currentTimeRef.current);

    return subscribe(paint);
  }, [timeline, subscribe, currentTimeRef]);

  return (
    <Text
      ref={ref}
      data-testid="step-caption"
      fz="calc(var(--mantine-font-size-sm) * 2)"
      fw={600}
      // Over the floor, which is mid-toned: a panel behind the text rather than the text alone,
      // so it stays legible wherever the court's markings fall under it.
      style={{
        position: 'absolute',
        top: 'var(--mantine-spacing-xs)',
        left: 'var(--mantine-spacing-xs)',
        padding: '2px 8px',
        borderRadius: 'var(--mantine-radius-sm)',
        background: 'var(--mantine-color-body)',
        // Denser than Mantine's shadow tokens, which layer black at 4-5% — tuned to lift a
        // white card off a white page. This one sits on a mid-toned floor that swallows them,
        // so the opacity is raised until the chip reads as laid over the court rather than
        // drawn on it.
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
        pointerEvents: 'none',
        // Hidden until the first step is reached; `paint` takes it from here.
        display: 'none',
      }}
    />
  );
}
