import { createTheme } from '@mantine/core';

// Roboto Condensed is self-hosted through @fontsource rather than fetched from a CDN: the
// roadmap commits this app to being packaged as a PWA, and a font loaded from a third party
// falls back to a system face the moment the coach is on a court with no network.
const FONT_STACK = '"Roboto Condensed", system-ui, sans-serif';

export const theme = createTheme({
  fontFamily: FONT_STACK,
  headings: { fontFamily: FONT_STACK },
  components: {
    ActionIcon: {
      // Round, every one of them. Set as a style rather than through the `radius` prop: that
      // prop resolves a token name or a pixel number, and a percentage is neither — it would
      // emit `var(--mantine-radius-50%)`, which is not a variable that exists.
      styles: { root: { borderRadius: '50%' } },
    },
  },
});
