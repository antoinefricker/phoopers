import type { EntityId, Keyframe, ResolvedTimeline } from '../engine';

export interface TimelineRowModel {
  entityId: EntityId;
  label: string;
  team: 'offense' | 'defense' | 'ball';
  keyframes: Keyframe[];
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

  return [...players, { entityId: 'ball', label: 'ball', team: 'ball', keyframes: timeline.anchors.ball ?? [] }];
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
