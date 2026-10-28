/**
 * Both drawers' headers, at one height set here rather than left to what each holds: the menu's
 * holds a logo and the settings' an arrow and a title, and with a close button on a phone either
 * could otherwise grow past the other. Mantine's own minimum is the same 60 px (measured), so
 * this changes nothing today and keeps it that way.
 */
export const DRAWER_HEADER_STYLES = { header: { height: '3.75rem', minHeight: '3.75rem' } } as const;
