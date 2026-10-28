import { useEffect } from 'react';
import { dialogIsOpen, isPressedBySpace, isTyping } from '../editor/shortcutGuards';

/**
 * Runs `toggle` when the coach presses Space, for as long as the caller is mounted.
 *
 * Unlike the editor's chords this is a bare key, the one every player on the web answers to, so
 * it has more to stay out of the way of than they do. A text field takes Space as a character. A
 * focused button, switch or tab is pressed by it, and the play button itself is one: acting as
 * well would toggle twice. A dialog, a menu or a drawer is open over the page. A chord with any
 * modifier is somebody else's. Held down, the key would flip playback at the keyboard's repeat
 * rate.
 *
 * `preventDefault` only when it acts, so the page does not scroll under a press that did
 * something and still does under one that did not.
 */
export function usePlayPauseShortcut(toggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.repeat || event.isComposing) return;
      if (event.defaultPrevented) return;
      if (isTyping(event.target) || isPressedBySpace(event.target)) return;
      if (dialogIsOpen()) return;

      event.preventDefault();
      toggle();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);
}
