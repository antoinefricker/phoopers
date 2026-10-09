import type { Step } from '../engine';

// Two times closer than this count as equidistant, so float noise cannot decide a tie.
const TIE_EPSILON = 1e-9;
// A step counts as "behind" or "ahead" only if it is clear of the current time by this much.
const STEP_EPSILON = 1e-6;

// Snaps t to the nearest step time within the threshold. When two steps are equidistant the
// earlier one wins, so the result never depends on the order the steps are stored in. Steps
// sharing a time (legal at a fork) resolve to that same time.
export function snapToStep(t: number, steps: readonly Step[], threshold: number): number {
  let best: number | undefined;
  let bestDistance = Infinity;

  for (const step of steps) {
    const distance = Math.abs(step.t - t);
    if (distance > threshold) continue;

    const nearer = distance < bestDistance - TIE_EPSILON;
    const tiedButEarlier = Math.abs(distance - bestDistance) <= TIE_EPSILON && best !== undefined && step.t < best;
    if (nearer || tiedButEarlier) {
      best = step.t;
      bestDistance = distance;
    }
  }

  return best ?? t;
}

export function adjacentStep(t: number, steps: readonly Step[], direction: 1 | -1): number | undefined {
  const times = steps
    .map((step) => step.t)
    .filter((time) => (direction === 1 ? time > t + STEP_EPSILON : time < t - STEP_EPSILON))
    .sort((a, b) => (direction === 1 ? a - b : b - a));

  return times[0];
}

// One mark per distinct time: steps sharing a time would otherwise stack identical ticks and
// duplicate React keys. Their names are joined so none is hidden.
export function stepMarks(steps: readonly Step[]): { value: number; label: string }[] {
  const byTime = new Map<number, string[]>();
  for (const step of steps) {
    byTime.set(step.t, [...(byTime.get(step.t) ?? []), step.name]);
  }

  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([value, names]) => ({ value, label: names.join(' / ') }));
}

// The slider needs a non-empty range: a zero-duration play would otherwise give min === max.
export function sliderMax(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration : 1;
}
