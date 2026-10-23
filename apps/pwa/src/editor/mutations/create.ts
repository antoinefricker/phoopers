import type { Branch, BranchId, CourtExtent, Keyframe, Play, PlayId, Player, PlayerId } from '../../engine';
import { extentOf } from '../../engine';
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

/**
 * Empties the open system without replacing it: the same id, name, court, extent, length and
 * root branch, on a court holding nothing but the ball.
 *
 * Not `createPlay` with the same name, which is what this looks like: `createPlay` mints a new
 * `PlayId`, and the draft's origin is matched on that id. Clearing through it would quietly turn
 * the next save from an overwrite into an insert, leaving the coach's stored system behind.
 *
 * The root branch keeps its id as well, so a playback context pointing at it survives the clear;
 * a caller watching a variant has to select the root itself, as deleting a branch already does.
 * Every variant goes with the players, not only the ones forked from the root: a branch forks at
 * a step, and there are no steps left for one to fork at.
 */
export function clearPlay(play: Play): Play {
  const empty = createPlay(
    // Only the court matters here: everything else is taken from `play` below, so an absent
    // extent or duration stays absent rather than being written out with a default.
    { name: play.name, court: play.court, extent: extentOf(play), lineup: 'empty', duration: 0 },
    { playId: play.id, rootBranchId: play.rootBranchId, offense: [], defense: [] },
  );

  return { ...play, players: empty.players, branches: empty.branches };
}
