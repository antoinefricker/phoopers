/** What a coach can change about how the app behaves for them. Kept in their browser, not their account. */
export interface Settings {
  /** Outline a token's reactive area on the court while the pointer is over it. */
  showHitAreas: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showHitAreas: true };
