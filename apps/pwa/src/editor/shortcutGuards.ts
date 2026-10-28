/** Whether the key is going into text, where a letter is a letter and not a command. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

// What already answers Space. A button, a switch, a tab and the rest are pressed with it, so a
// shortcut on the same key would act twice: once for the page and once for the thing focused.
const PRESSED_BY_SPACE =
  'button, summary, a[href], [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"]';

/** Whether the focused element is one that Space presses, so the key is already spoken for. */
export function isPressedBySpace(target: EventTarget | null): boolean {
  // `Element`, not `HTMLElement`: the target can be the svg glyph inside a button.
  return target instanceof Element && target.closest(PRESSED_BY_SPACE) !== null;
}

/**
 * A dialog or a menu is open — including this app's popovers and drawers, which carry the same
 * role. What is behind it is not what the coach is addressing, and the menu offers its actions
 * as entries anyway.
 */
export const dialogIsOpen = (): boolean => document.querySelector('[role="dialog"]') !== null;
