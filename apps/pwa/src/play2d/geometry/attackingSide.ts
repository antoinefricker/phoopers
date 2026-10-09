import type { ResolvedTimeline } from '../../engine';
import { COURT_SPEC } from './court';
import type { CourtSide } from './court';

/**
 * The half of the floor the offense attacks, read from where its players actually stand: the
 * mean x of every offensive keyframe, against the half-way line. This lives beside the timeline
 * rather than in court.ts so the court geometry stays free of play data. The anchors cover the
 * whole branch, so the answer cannot flip while the play runs. With no offense to read it
 * falls back to the left half.
 */
export function attackingSide(timeline: ResolvedTimeline): CourtSide {
  const xs = timeline.players
    .filter((player) => player.team === 'offense')
    .flatMap((player) => timeline.anchors[player.id] ?? [])
    .flatMap((keyframe) => (keyframe.position === undefined ? [] : [keyframe.position.x]));

  if (xs.length === 0) {
    return 'left';
  }

  const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  return mean > COURT_SPEC[timeline.court].length / 2 ? 'right' : 'left';
}
