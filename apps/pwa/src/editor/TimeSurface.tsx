import { Box } from '@mantine/core';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useShiftWheelScroll } from './useShiftWheelScroll';

/**
 * The box the transport, the ruler and the tracks sit in, and the grid behind them: everywhere the
 * shared time axis is on screen, so a wheel over any of it scrolls the axis.
 *
 * Its own component because the wheel handler reads the timeline's viewport, which only exists
 * below the provider that `TimeRegion` renders.
 */
export function TimeSurface({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useShiftWheelScroll(ref);

  return (
    <Box ref={ref} style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {children}
    </Box>
  );
}
