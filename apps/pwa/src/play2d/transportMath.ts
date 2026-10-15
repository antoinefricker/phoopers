import type { Step } from '../engine';

// Two times closer than this count as equidistant, so float noise cannot decide a tie.
const TIE_EPSILON = 1e-9;
// A step counts as "behind" or "ahead" only if it is clear of the current time by this much.
/**
 * The grid every authored time falls on, in seconds. A play is read by people, and a keyframe
 * at 2.37s says nothing a keyframe at 2.5s does not.
 */
export const TIME_GRID_S = 0.5;

/**
 * Rounds a time to the nearest grid cell, never below zero.
 *
 * The multiply-then-divide keeps the result a clean multiple: adding 0.5 repeatedly, or
 * multiplying a float by a float, drifts into values like 6.300000000000001 that print and
 * compare badly. A time that is not a number becomes 0, there being no cell for it.
 */
export function snapToGrid(t: number): number {
  if (!Number.isFinite(t)) return 0;

  return Math.max(0, Math.round(t / TIME_GRID_S) * TIME_GRID_S);
}

const STEP_EPSILON = 1e-6;

// Snaps t to the nearest step time within the threshold. When two steps are equidistant the
// earlier one wins, so the result never depends on the order the steps are stored in. Steps
// sharing a time (legal at a fork) resolve to that same time.
// The three surfaces that share one time axis — the transport's scrubber, the step ruler and
// the keyframe tracks — lay out against these. The gutter holds the row labels on the timeline
// and the playback buttons on the transport, so both axes start at the same x.
export const GUTTER_WIDTH = '160px';

// Room kept at each end of every axis: half the width of a keyframe marker, which is centred
// on its time and so reaches that far past it. Without it the last marker overflows and the
// panel grows a horizontal scrollbar. The scrubber takes the same inset or it drifts from the
// markers at the far end — which is why the number lives here, with the shared axis geometry,
// rather than beside the marker it is derived from.
export const TRACK_INSET_PX = 6;

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

/**
 * The step the playhead has reached: the last one at or before `t`. Undefined before the first
 * step, since a play can open on movement that belongs to no step yet, and for a time that is
 * not a number — naming a step there would be worse than naming none.
 *
 * Where two steps share a time the later one in the list wins. The ruler joins their names
 * side by side, but a caption has room for one.
 */
export function stepAt(t: number, steps: readonly Step[]): Step | undefined {
  if (!Number.isFinite(t)) return undefined;

  let reached: Step | undefined;
  for (const step of steps) {
    if (step.t <= t && (reached === undefined || step.t >= reached.t)) reached = step;
  }

  return reached;
}

/**
 * The step whose name is showing at `t`, or undefined when none is.
 *
 * A step's window is `[t, t + duration]`, or `[t, the next step's t]` with no duration, or
 * `[t, playDuration]` for a last step with none. Windows cannot overlap by construction — the
 * editor's handle stops at the next step — but a retime can leave one overrunning, so the
 * window starting latest at or before `t` wins; the answer never depends on array order.
 *
 * A duration that is not a positive number gives no window at all. `validatePlay` reports it,
 * which does not remove it from the play, and showing a name for ever would be worse.
 */
export function stepLabelAt(t: number, steps: readonly Step[], playDuration: number): Step | undefined {
  if (!Number.isFinite(t)) return undefined;

  const ordered = [...steps].sort((a, b) => a.t - b.t);
  let showing: Step | undefined;
  ordered.forEach((step, index) => {
    if (step.t > t) return;
    const implicit = ordered[index + 1]?.t ?? playDuration;
    const end =
      step.duration === undefined
        ? implicit
        : Number.isFinite(step.duration) && step.duration > 0
          ? step.t + step.duration
          : step.t;
    // Inclusive at the end so two steps sharing a time still name something.
    if (t <= end) showing = step;
  });

  return showing;
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
