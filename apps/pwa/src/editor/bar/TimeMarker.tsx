import { UnstyledButton } from '@mantine/core';
import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react';
import { MARKER_HEIGHT_PX } from '../timelineGeometry';

export interface TimeMarkerProps extends Omit<ComponentPropsWithRef<'button'>, 'color' | 'children'> {
  /** The left corners' radius, in px. */
  radiusLeft?: number;
  /** The right corners' radius, in px. */
  radiusRight?: number;
  /** Any CSS colour. Left out, white. */
  background?: string;
  /** Any CSS colour. Left out, grey. */
  borderColor?: string;
  /** Outlines the block in the app's own colour, thicker: a white fill leaves nothing else to carry it. */
  selected?: boolean;
  /** Drawn in the middle of the block. */
  icon?: ReactNode;
}

/**
 * The block that stands for a time on a track: a keyframe's marker, and the handle of a bar. It has
 * the marker's height and leaves its width and its place to the caller, which gives them in `style`.
 * A button, not a div: it is reachable by keyboard.
 */
export function TimeMarker({
  radiusLeft = 2,
  radiusRight = 2,
  background = 'var(--mantine-color-white)',
  borderColor = 'var(--mantine-color-gray-5)',
  selected = false,
  icon,
  style,
  ...rest
}: TimeMarkerProps): ReactElement {
  return (
    <UnstyledButton
      {...rest}
      style={{
        height: MARKER_HEIGHT_PX,
        padding: 0,
        // Selection is the border: the PRIMARY, not a named blue, which an offense token wears
        // byte for byte, so selection would stop being a signal of its own.
        border: selected ? '2px solid var(--mantine-primary-color-filled)' : `1px solid ${borderColor}`,
        borderRadius: `${radiusLeft}px ${radiusRight}px ${radiusRight}px ${radiusLeft}px`,
        background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...style,
      }}
    >
      {icon}
    </UnstyledButton>
  );
}
