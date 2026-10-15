import type { EntityId, Keyframe, ResolvedTimeline } from '../engine';
import { TIME_GRID_S, gridTime } from '../play2d/transportMath';

export interface TimelineRowModel {
  entityId: EntityId;
  label: string;
  team: 'offense' | 'defense' | 'ball';
  keyframes: Keyframe[];
}

// A keyframe marker is an upright rectangle, taller than it is wide, so it reads as an instant
// rather than as a blob. It is centred on its time with `translate(-50%)`, so it reaches half
// its WIDTH past that time — which is what the track has to keep room for at either end.
export const MARKER_WIDTH_PX = 12;
export const MARKER_HEIGHT_PX = 18;

// Both live with the shared axis geometry because the transport needs them too: the inset is
// the room each end of the axis keeps, and must stay at or above half `MARKER_WIDTH_PX` or a
// marker at t = 0 or t = duration overflows its track again; the gutter is the scrollbar's
// width, reserved on the scrubber as well as on the tracks so the axis ends at one x.
export { SCROLLBAR_GUTTER_PX, TRACK_INSET_PX } from '../play2d/transportMath';

// Past this many lines the grid stops being a reading aid and becomes a smear of DOM nodes, so
// a play long enough to cross it keeps only its whole seconds. 240 is four minutes of them.
const MAX_GRID_LINES = 240;

export interface GridTick {
  t: number;
  /** A whole second, drawn more strongly than the half-second between two of them. */
  major: boolean;
}

/**
 * The vertical lines behind the ruler and the tracks: one per `TIME_GRID_S` cell, from 0 to the
 * duration inclusive, each marked major on a whole second.
 *
 * The cell is the authoring grid, so a minor line is literally "a time a keyframe can take".
 * A duration that is not a positive number has no grid rather than one line or an endless loop.
 *
 * Times come from `gridTime`, which is what keeps a cell count a clean decimal: accumulating
 * the cell, or simply multiplying by it, drifts into values like 6.300000000000001 that miss
 * the `% 1 === 0` test deciding major from minor.
 */
export function gridTicks(duration: number): GridTick[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const cells = Math.floor(duration / TIME_GRID_S);
  // Minors first, and only while they stay legible; beyond that the whole seconds carry the grid.
  const step = cells + 1 > MAX_GRID_LINES ? Math.round(1 / TIME_GRID_S) : 1;
  const ticks: GridTick[] = [];
  for (let index = 0; index <= cells; index += step) {
    const t = gridTime(index);
    ticks.push({ t, major: t % 1 === 0 });
  }

  return ticks;
}

export function fractionOf(t: number, duration: number): number {
  if (!(duration > 0) || !Number.isFinite(t)) return 0;

  return Math.min(Math.max(t / duration, 0), 1);
}

// Reads `anchors`, which carries each entity's keyframes, NOT `spans`: a prepared span
// substitutes {0,0} for an attached ball endpoint, so building rows from spans would draw the
// ball's markers at the court corner. A player with no track still gets a row (empty), so the
// coach can see they have no motion and has a row on which to author it.
export function rowsOf(timeline: ResolvedTimeline): TimelineRowModel[] {
  const players: TimelineRowModel[] = timeline.players.map((player) => ({
    entityId: player.id,
    label: player.label,
    team: player.team,
    keyframes: timeline.anchors[player.id] ?? [],
  }));

  // The ball leads. It is the one row a coach never reorders — it is not a player and has no
  // place in `play.players`, which carries the order of everything that is — so it sits where
  // nothing has to be dragged past it.
  return [{ entityId: 'ball', label: 'ball', team: 'ball', keyframes: timeline.anchors.ball ?? [] }, ...players];
}

// Maps a pointer's x to a time across a row. Without layout (jsdom, a hidden canvas) the box is
// 0 wide, and nothing downstream checks a time for finiteness, so every degenerate input
// resolves to 0 rather than NaN.
export function timeFromClientX(clientX: number, rect: DOMRect, duration: number): number {
  if (!(rect.width > 0) || !(duration > 0)) return 0;
  const fraction = (clientX - rect.left) / rect.width;
  if (!Number.isFinite(fraction)) return 0;

  return Math.min(Math.max(fraction, 0), 1) * duration;
}
