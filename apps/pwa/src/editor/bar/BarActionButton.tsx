import { ActionIcon } from '@mantine/core';
import { useHover, useMergedRef } from '@mantine/hooks';
import type { ComponentPropsWithRef, ReactElement, ReactNode } from 'react';

export interface BarActionButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'color' | 'children'> {
  /** Names the button for a screen reader; there is no text to do it. */
  label: string;
  icon: ReactNode;
  /** Any CSS colour. Left out, the button has no fill. */
  background?: string;
  /** Any CSS colour, for the pointer being over the button. Left out, the fill stays. */
  hoverBackground?: string;
  /** Any CSS colour. Left out, the app's own colour. */
  iconColor?: string;
  testId?: string;
}

/**
 * A small control drawn inside a bar, at its end: remove, edit. Its colours are the caller's, so
 * it wears the bar's own whichever bar it sits in.
 */
export function BarActionButton({
  label,
  icon,
  background = 'transparent',
  hoverBackground,
  iconColor = 'var(--mantine-primary-color-filled)',
  testId,
  ref: forwardedRef,
  style,
  ...rest
}: BarActionButtonProps): ReactElement {
  const { hovered, ref: hoverRef } = useHover<HTMLButtonElement>();
  // A Popover target hands its own ref down, and the hover needs the element too.
  const ref = useMergedRef(hoverRef, forwardedRef);

  return (
    <ActionIcon
      ref={ref}
      size="xs"
      variant="transparent"
      data-testid={testId}
      aria-label={label}
      {...rest}
      style={{
        background: hovered && hoverBackground !== undefined ? hoverBackground : background,
        color: iconColor,
        ...style,
      }}
    >
      {icon}
    </ActionIcon>
  );
}
