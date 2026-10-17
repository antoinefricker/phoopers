import type { Branch, BranchId, CourtExtent, Keyframe, Play, PlayId, Player, PlayerId } from '../../engine';
import { displayedCentre, freeSpot } from '../bounds';
import type { LineupKind } from '../lineups';
import { LINEUPS } from '../lineups';

/**
 * How close a player has to be to the ball's resting place for it to move aside, in metres.
 *
 * A ball drawn under a token is invisible: the coach cannot see that it is loose, let alone
 * decide who picks it up. 0.7 m is the court layer's own player hit radius, so this is the
 * distance at which a token's reach starts covering the ball.
 */
export const BALL_CLEARANCE = 0.7;

export interface CreatePlayOptions {
  name: string;
  court: Play['court'];
  extent: CourtExtent;
  lineup: LineupKind;
  /** The floor for the system's length, in seconds. */
  duration: number;
}

/** Every id the new system needs, minted by the caller so this stays a pure function. */
export interface CreatePlayIds {
  playId: PlayId;
  rootBranchId: BranchId;
  offense: PlayerId[];
  defense: PlayerId[];
}

/**
 * Builds a whole system from a name, a court and a starting placement.
 *
 * Everything is written in one pass rather than through `addPlayer` ten times, so the result is
 * a valid play at once: every player carries a keyframe at t=0, which is what makes their token
 * appear, and the root branch is named after the system.
 */
export function createPlay(options: CreatePlayOptions, ids: CreatePlayIds): Play {
  const { name, court, extent, lineup, duration } = options;
  const positions = LINEUPS[lineup];
  const players: Player[] = [];
  const tracks: Record<string, Keyframe[]> = {};

  for (const team of ['offense', 'defense'] as const) {
    ids[team].forEach((id, index) => {
      const position = positions[team][index];
      if (position === undefined) return;
      // Each side is numbered on its own, from 1, the symbol's shape telling the teams apart.
      players.push({ id, team, number: String(index + 1) });
      tracks[id] = [{ t: 0, position }];
    });
  }

  // Loose rather than held, because the coach decides who has it, and in the middle of what is
  // on screen, because that is where the eye lands — stepped aside when the chosen placement
  // already stands there, which half-court three-on-three does exactly.
  const choice = { court, extent };
  const placed = players.flatMap((player) => tracks[player.id]?.[0]?.position ?? []);
  tracks.ball = [{ t: 0, position: freeSpot(choice, displayedCentre(choice), placed, BALL_CLEARANCE) }];

  const root: Branch = {
    id: ids.rootBranchId,
    parentId: null,
    forkStepId: null,
    name,
    tracks,
    steps: [],
    screens: [],
  };

  return {
    id: ids.playId,
    name,
    court,
    extent,
    duration,
    players,
    rootBranchId: ids.rootBranchId,
    branches: [root],
  };
}
