import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it, vi } from 'vitest';
import { BarActionButton } from './BarActionButton';
import { BarHandle } from './BarHandle';
import type { BarGesture } from './BarHandle';
import { TrackBar } from './TrackBar';

// A gesture that does nothing: these tests look at the drawing, not at the drag.
const still = {
  onPointerDown: () => {},
  onPointerMove: () => {},
  onPointerUp: () => {},
  onPointerCancel: () => {},
  onKeyDown: () => {},
} as BarGesture;

const wrap = (node: React.ReactNode) => render(<MantineProvider>{node}</MantineProvider>);

describe('BarHandle', () => {
  it('wears the look of a keyframe marker by default', () => {
    wrap(<BarHandle testId="h" label="Handle" bind={still} />);
    const handle = screen.getByTestId('h');

    expect(handle.style.height).toBe('18px');
    expect(handle.style.border).toContain('1px solid');
    expect(handle.style.borderRadius).toBe('2px 2px 2px 2px');
    expect(handle).toHaveAccessibleName('Handle');
  });

  it('takes its corners, colours and icon from the caller', () => {
    wrap(
      <BarHandle
        testId="h"
        label="Handle"
        bind={still}
        radiusLeft={9}
        radiusRight={0}
        background="rgb(1, 2, 3)"
        borderColor="rgb(4, 5, 6)"
        icon={<svg data-testid="icon" />}
      />,
    );
    const handle = screen.getByTestId('h');

    expect(handle.style.borderRadius).toBe('9px 0px 0px 9px');
    expect(handle.style.background).toBe('rgb(1, 2, 3)');
    expect(handle.style.border).toContain('rgb(4, 5, 6)');
    expect(handle).toContainElement(screen.getByTestId('icon'));
  });
});

describe('BarActionButton', () => {
  it('shows the hover colour only while the pointer is over it, and reports its click', () => {
    const onClick = vi.fn();
    wrap(
      <BarActionButton
        testId="a"
        label="Remove"
        icon={<svg />}
        background="rgb(1, 1, 1)"
        hoverBackground="rgb(2, 2, 2)"
        iconColor="rgb(3, 3, 3)"
        onClick={onClick}
      />,
    );
    const button = screen.getByRole('button', { name: 'Remove' });

    expect(button.style.background).toBe('rgb(1, 1, 1)');
    expect(button.style.color).toBe('rgb(3, 3, 3)');
    fireEvent.mouseEnter(button);
    expect(button.style.background).toBe('rgb(2, 2, 2)');
    fireEvent.mouseLeave(button);
    expect(button.style.background).toBe('rgb(1, 1, 1)');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('TrackBar', () => {
  const bar = (props: Partial<React.ComponentProps<typeof TrackBar>> = {}) =>
    wrap(<TrackBar testId="b" left="0px" width="100px" background="rgb(9, 9, 9)" message="Hello" {...props} />);
  const padding = () => screen.getByTestId('bar-caption').parentElement?.style;

  it('fills with the colours it is given and shows its message', () => {
    bar({ borderColor: 'rgb(7, 7, 7)', messageColor: 'rgb(8, 8, 8)' });
    const element = screen.getByTestId('b');

    expect(element.style.background).toBe('rgb(9, 9, 9)');
    expect(element.style.border).toContain('rgb(7, 7, 7)');
    expect(screen.getByTestId('bar-caption')).toHaveTextContent('Hello');
    expect(screen.getByTestId('bar-caption').style.color).toBe('rgb(8, 8, 8)');
  });

  it('keeps its message 8px from an edge that has no handle, and past a handle where there is one', () => {
    bar({
      handleWidth: '24px',
      startHandle: <BarHandle testId="s" label="Start" bind={still} />,
      endHandle: <BarHandle testId="e" label="End" bind={still} />,
    });

    expect(padding()?.paddingLeft).toBe('calc(2px + min(24px, 50%))');
    expect(padding()?.paddingRight).toBe('calc(2px + min(24px, 50%))');
    expect(screen.getByTestId('s').parentElement?.style.width).toBe('min(24px, 50%)');
  });

  it('starts its message past what covers the bar start, never closer than 8px', () => {
    bar({ messageClearPx: 28 });
    expect(padding()?.paddingLeft).toBe('28px');
  });

  it('draws its actions in the order given', () => {
    bar({
      actions: [
        <BarActionButton key="a" label="First" icon={<svg />} onClick={() => {}} />,
        <BarActionButton key="b" label="Second" icon={<svg />} onClick={() => {}} />,
      ],
    });

    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['First', 'Second']);
  });
});
