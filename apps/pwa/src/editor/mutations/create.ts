import type { Branch, BranchId, CourtExtent, Keyframe, Play, PlayId, Player, PlayerId, Vec2 } from '../../engine';
import type { CourtChoice } from '../bounds';
import { displayedCentre } from '../bounds';
import type { LineupKind } from '../lineups';
import { LINEUPS } from '../lineups';

/**
 * How close a player has to be to the ball's resting place for it to move aside, in metres.
 *
 * The court layer picks a player within 0.7 m of a click, so a ball any nearer than that cannot
 * be picked up: the gesture is ambiguous and the coach can never assign possession.
 */
export const BALL_CLEARANCE = 0.7;

/** How far the ball steps towards midcourt when its resting place is taken, in metres. */
const BALL_SIDESTEP = 2;

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
 * Where the ball starts: loose, in the middle of what is on screen.
 *
 * Loose rather than held, because the coach decides who has it. In the middle, because that is
 * where the eye lands. When a player of the chosen placement already stands there, it steps
 * towards midcourt instead of hiding under them.
 */
function ballPosition(choice: CourtChoice, players: readonly Vec2[]): Vec2 {
  const centre = displayedCentre(choice);
  const taken = players.some((p) => Math.hypot(p.x - centre.x, p.y - centre.y) <= BALL_CLEARANCE);

  return taken ? { x: centre.x - BALL_SIDESTEP, y: centre.y } : centre;
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

  const placed = players.flatMap((player) => tracks[player.id]?.[0]?.position ?? []);
  tracks.ball = [{ t: 0, position: ballPosition({ court, extent }, placed) }];

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
