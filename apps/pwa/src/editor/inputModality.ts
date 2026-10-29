// Whether the last thing the coach did was press a key or press a pointer. Focus arrives the same
// way from both, and what should happen next does not: a coach who tabs to something out of sight
// wants the view brought to it, one who has just pressed the scrubber wants it left where it is.
//
// Held at the window, in the capture phase, because the key that moves focus is pressed on the
// element focus is LEAVING, which is usually not inside the surface that receives it.
let keyboard = false;
let followers = 0;

const onKeyDown = () => {
  keyboard = true;
};
const onPointerDown = () => {
  keyboard = false;
};

/** Starts following the input device for as long as the caller is mounted. Returns the stop. */
export function followInputModality(): () => void {
  if (followers === 0) {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
  }
  followers += 1;

  return () => {
    followers -= 1;
    if (followers === 0) {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    }
  };
}

/**
 * Whether the latest input was the keyboard. False before any input, so focus the page gives
 * itself, or code gives it after a click, is not taken for a keyboard user's.
 */
export const lastInputWasKeyboard = (): boolean => keyboard;
