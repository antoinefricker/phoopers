/** Switches a developer flips from the browser console, without a reload. */
export interface PhoopersDebugFlags {
  /** Outline a token's reactive area while the pointer is over it on the court. */
  showHitAreas: boolean;
}

declare global {
  interface Window {
    __phoopers?: Partial<PhoopersDebugFlags>;
  }
}

const DEFAULT_FLAGS: PhoopersDebugFlags = { showHitAreas: true };

// Published on `window` so that `__phoopers.showHitAreas = false` works from the console. The
// defaults are written once, so the object lists every flag a developer can set.
if (typeof window !== 'undefined') {
  window.__phoopers = { ...DEFAULT_FLAGS, ...window.__phoopers };
}

/** Read when drawing, not captured at import, so a flip in the console shows on the next render. */
export const debugFlag = <K extends keyof PhoopersDebugFlags>(name: K): PhoopersDebugFlags[K] =>
  (typeof window === 'undefined' ? undefined : window.__phoopers?.[name]) ?? DEFAULT_FLAGS[name];
