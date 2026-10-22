import type { Shortcut } from './useEditorShortcut';

/**
 * The editor's chords, in one place so a menu entry announces the very thing its hook listens
 * for. All of them are Alt+Shift: the bare Alt forms were rejected because Chrome and Edge open
 * their own menu on Alt+E and Alt+F, and a shortcut that works on one platform only is worse
 * than none — nobody can be told it exists.
 */
export const MODE_SHORTCUT: Shortcut = { code: 'KeyE', letter: 'e', aria: 'Alt+Shift+E' };

export const SAVE_SHORTCUT: Shortcut = { code: 'KeyS', letter: 's', aria: 'Alt+Shift+S' };
