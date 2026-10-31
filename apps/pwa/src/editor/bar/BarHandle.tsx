import type { ReactElement, ReactNode } from 'react';
import { TimeMarker } from './TimeMarker';
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
 * The handle of a bar on the timeline: a `TimeMarker`, which sets the time of the edge it stands
 * on. It fills the box its bar gives it in width. The arrow keys retime it through the same
 * constraint the drag uses.
 */
export function BarHandle({
  testId,
  label,
  bind,
  radiusLeft,
  radiusRight,
  background,
  borderColor,
  icon,
}: BarHandleProps): ReactElement {
  return (
    <TimeMarker
      data-testid={testId}
      aria-label={label}
      radiusLeft={radiusLeft}
      radiusRight={radiusRight}
      background={background}
      borderColor={borderColor}
      icon={icon}
      style={{ width: '100%', cursor: 'ew-resize', touchAction: 'none', pointerEvents: 'auto' }}
      {...bind}
    />
  );
}
