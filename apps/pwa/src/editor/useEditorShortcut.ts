import { useEffect } from 'react';

export interface Shortcut {
  /**
   * The physical key, not the character. On macOS, Option+E is the dead key that begins an acute
   * accent, so the OS hands the page a `key` of "Dead" or "´" rather than "e"; `code` is what
   * survives that, being blind to modifiers and to composition.
   */
  code: string;
  /**
   * The character the same key carries, as a fallback. `code` is a position on a QWERTY board,
   * so on a layout that puts this letter elsewhere it names the wrong key, and this names the
   * right one. Either match is accepted.
   */
  letter: string;
  /** The chord in the spelling `aria-keyshortcuts` asks for. */
  aria: string;
}

/** Whether the key is going into text, where a letter is a letter and not a command. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/**
 * Runs `onTrigger` when the coach presses Alt+Shift and this shortcut's key, for as long as the
 * caller is mounted.
 *
 * These are the first shortcuts in this app that are not attached to a focused element: every
 * other key handler here belongs to the thing it acts on — Delete to the timeline, the arrows to
 * a marker, Enter to a field — and so never had to ask whether the coach meant a command or a
 * character. A chord on the window does, which is what the guards below are. Alt+Shift narrows
 * the question without settling it: on macOS those modifiers are how accented characters are
 * typed, so a coach naming a player "Désiré" holds this very pair on purpose.
 *
 * `enabled` is for a shortcut whose action is not available — an unsaveable system — so that the
 * key does nothing rather than something that fails.
 */
export function useEditorShortcut(shortcut: Shortcut, onTrigger: () => void, enabled = true): void {
  const { code, letter } = shortcut;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== code && event.key.toLowerCase() !== letter) return;
      // Both modifiers, and only these two: Ctrl and Cmd make other chords, which may be
      // somebody else's.
      if (!event.altKey || !event.shiftKey) return;
      if (event.ctrlKey || event.metaKey) return;
      // Held down, the key would fire at the keyboard's repeat rate.
      if (event.repeat) return;
      // Mid-composition an IME sends keys that are not yet the character being chosen.
      if (event.isComposing) return;
      if (isTyping(event.target)) return;
      // A dialog or a menu is open — including this app's popovers, which carry the same role.
      // What is behind it is not what the coach is addressing, and the menu offers these
      // actions as entries anyway.
      if (document.querySelector('[role="dialog"]') !== null) return;

      onTrigger();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [code, letter, onTrigger, enabled]);
}
