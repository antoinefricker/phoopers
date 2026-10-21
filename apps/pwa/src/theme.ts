import { createTheme } from '@mantine/core';

// Roboto Condensed is self-hosted through @fontsource rather than fetched from a CDN: the
// roadmap commits this app to being packaged as a PWA, and a font loaded from a third party
// falls back to a system face the moment the coach is on a court with no network.
const FONT_STACK = '"Roboto Condensed", system-ui, sans-serif';

export const theme = createTheme({
  // Deliberately NOT the blue the offense wears. Mantine's default primary is blue,
  // which made the app's own chrome — the play button, the scrubber, a focus ring — the same
  // colour as one of the two teams, so blue meant both "this app" and "the attack". The teams
  // keep their blue and red, which are the court's language and not the product's.
  primaryColor: 'violet',
  // Let Mantine pick black or white for whatever sits on a filled control, rather than taking
  // its white default. It is what the primary being a setting costs: the app wore a yellow
  // primary, where white on filled measured 1.86:1 on the play button — the app's main control,
  // effectively illegible. Violet needs no rescuing, but the next palette might. Set on the
  // theme and not per button so a control added later cannot miss it.
  autoContrast: true,
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
