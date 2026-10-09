/**
 * Dribble squiggle, in court metres. A player token is ~0.45 m in radius and the path stroke
 * is 0.08 m. An amplitude of 0.12 m (a 0.24 m crest-to-trough) is about half a token radius:
 * visibly not a straight line at full-court scale (~9 px at 1000 px wide), yet it stays
 * inside the token's footprint so adjacent paths do not tangle. A 0.6 m wavelength gives a
 * tight ripple (~1.3 token radii per period, ~20 px) that reads as a bouncing ball rather
 * than a lazy S-curve, and a 4 m dribble drive still shows ~7 full waves.
 */
export const DRIBBLE_AMPLITUDE = 0.12;
export const DRIBBLE_WAVELENGTH = 0.6;
