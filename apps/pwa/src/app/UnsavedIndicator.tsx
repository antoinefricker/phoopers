import type { ReactNode } from 'react';
import { Indicator } from '@mantine/core';

interface Props {
  /** True when there is something to say, which is the only state that shows a mark. */
  dirty: boolean;
  /**
   * A number to write on the mark, for a caller that counts something to look at: the problems
   * button. It grows the dot to a pill that holds it; the colour and the pulse are the same.
   */
  label?: ReactNode;
  /** For a mark inside a line of text, rather than on a control of its own. */
  inline?: boolean;
  children: ReactNode;
}

/**
 * There is something to save, said on whatever it is said about. With a label it says how many
 * things to look at, in the same mark.
 *
 * Shared by the menu's Save entry and the burger that opens it, so the mark a coach sees in the
 * header and the one they find inside are the same mark rather than two conventions.
 *
 * It carries no name of its own: Mantine's indicator is decorative, and a dot pulsing beside a
 * control says nothing to a screen reader. Each caller is responsible for saying it in words —
 * the burger in its `aria-label`, the Save entry in its label.
 */
export function UnsavedIndicator({ dirty, label, inline = false, children }: Props) {
  return (
    <Indicator
      color="orange"
      label={label}
      // Big enough for a figure; left to Mantine's own small dot when there is none.
      size={label === undefined ? undefined : 16}
      processing
      // Inline for a mark on a word, which has no box of its own to hang off.
      inline={inline}
      // Mantine's own corner, both on the burger and on the word: the top right is where the
      // eye already checks for a badge, and both marks reading the same way is the point of
      // this component.
      position="top-end"
      disabled={!dirty}
    >
      {children}
    </Indicator>
  );
}
