import { createTheme } from '@mantine/core';

// Roboto Condensed is self-hosted through @fontsource rather than fetched from a CDN: the
// roadmap commits this app to being packaged as a PWA, and a font loaded from a third party
// falls back to a system face the moment the coach is on a court with no network.
const FONT_STACK = '"Roboto Condensed", system-ui, sans-serif';

export const theme = createTheme({
  fontFamily: FONT_STACK,
  headings: { fontFamily: FONT_STACK },
});
