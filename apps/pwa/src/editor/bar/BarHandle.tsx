import { UnstyledButton } from '@mantine/core';
import type { ReactElement, ReactNode } from 'react';
import { MARKER_HEIGHT_PX } from '../timelineGeometry';
import type { useTimeDrag } from '../useTimeDrag';

export type BarGesture = ReturnType<ReturnType<typeof useTimeDrag>['bind']>;

export interface BarHandleProps {
  testId: string;
  /** Names the handle for a keyboard user and a screen reader. */
  label: string;
  /** The gesture that sets the edge this handle stands for. */
  bind: BarGesture;
  /** The left corners' radius, in px. */
  radiusLeft?: number;
  /** The right corners' radius, in px. */
  radiusRight?: number;
  /** Any CSS colour. Left out, white, as a keyframe's marker is. */
  background?: string;
  /** Any CSS colour. Left out, the grey of a keyframe's marker. */
  borderColor?: string;
  /** Drawn in the middle of the handle. */
  icon?: ReactNode;
}

/**
 * The handle of a bar on the timeline: a block drawn as a keyframe's marker is, which sets the
 * time of the edge it stands on. It fills the box its bar gives it in width and keeps the marker's
 * height, centred. A button, not a div: it is reachable by keyboard, and the arrow keys retime it
 * through the same constraint the drag uses.
 */
export function BarHandle({
  testId,
  label,
  bind,
  radiusLeft = 2,
  radiusRight = 2,
  background = 'var(--mantine-color-white)',
  borderColor = 'var(--mantine-color-gray-5)',
  icon,
}: BarHandleProps): ReactElement {
  return (
    <UnstyledButton
      data-testid={testId}
      aria-label={label}
      style={{
        width: '100%',
        height: MARKER_HEIGHT_PX,
        padding: 0,
        border: `1px solid ${borderColor}`,
        borderRadius: `${radiusLeft}px ${radiusRight}px ${radiusRight}px ${radiusLeft}px`,
        background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: 'ew-resize',
        touchAction: 'none',
        pointerEvents: 'auto',
      }}
      {...bind}
    >
      {icon}
    </UnstyledButton>
  );
}
