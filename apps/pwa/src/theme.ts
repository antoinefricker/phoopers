import { createTheme, type CSSVariablesResolver } from '@mantine/core';

// The wordmark in the header is a PNG whose backdrop is opaque rather than cut out, so the page
// meets it rather than the other way round: at this exact value the logo has no visible plate
// around it, which at phone width over a white page it otherwise does.
const PAGE_BACKGROUND = '#fafafa';

// Roboto Condensed is self-hosted through @fontsource rather than fetched from a CDN: the
// roadmap commits this app to being packaged as a PWA, and a font loaded from a third party
// falls back to a system face the moment the coach is on a court with no network.
const FONT_STACK = '"Roboto Condensed", system-ui, sans-serif';

export const theme = createTheme({
  // Every control is squared off to the same small radius, icon buttons included: ActionIcon
  // used to be overridden to a full circle here, and the two shapes side by side in the
  // editor's header read as two different toolbars. Set on the theme rather than per
  // component so nothing added later has to remember it.
  defaultRadius: 'sm',
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
});

// Through Mantine's own variable rather than a stylesheet of our own: `--mantine-color-body` is
// what the library paints the page with and what a component asks for when it wants to sit on
// it, so overriding the variable keeps the two in step. Only the light scheme is given a value —
// the app has no dark one yet, and guessing a dark page here would be a colour nobody measured.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-body': PAGE_BACKGROUND },
  dark: {},
});
