import type { Branch, Play, Player, PlayerId, Vec2 } from '../../engine';
import { COURT_DIMENSIONS } from '../../engine';
import { FORMATION } from '../formation';

// Offense is numbered 1..5 and defense X1..X5, so each side counts on its own. A label is
// never reused: the next free integer is one past the highest in use, which keeps numbering
// stable when a middle player is removed.
export function nextLabel(players: readonly Player[], team: 'offense' | 'defense'): string {
  const used = players
    .filter((p) => p.team === team)
    .map((p) => Number.parseInt(p.label.replace(/^X/, ''), 10))
    .filter((n) => Number.isFinite(n));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return team === 'offense' ? String(next) : `X${next}`;
}

const centre = (play: Play): Vec2 => {
  const { length, width } = COURT_DIMENSIONS[play.court];

  return { x: length / 2, y: width / 2 };
};

const mapRoot = (play: Play, mutate: (branch: Branch) => Branch): Branch[] =>
  play.branches.map((b) => (b.id === play.rootBranchId ? mutate(b) : b));

// A player placed without a keyframe is absent from the resolved timeline rather than drawn
// at the origin, so the token would simply not appear. Writing t=0 on placement is what keeps
// that unreachable by hand.
export function addPlayer(play: Play, team: 'offense' | 'defense', id: PlayerId): Play {
  const player: Player = { id, team, label: nextLabel(play.players, team) };

  return {
    ...play,
    players: [...play.players, player],
    branches: mapRoot(play, (branch) => ({
      ...branch,
      tracks: { ...branch.tracks, [id]: [{ t: 0, position: centre(play) }] },
    })),
  };
}

// Screens hold player ids, so they are swept with the player. The ball track is deliberately
// NOT swept: a keyframe attached to the removed player is reported by validatePlay as
// unknown-player-reference so the coach can reassign possession rather than lose it.
export function removePlayer(play: Play, playerId: PlayerId): Play {
  if (!play.players.some((p) => p.id === playerId)) return play;

  return {
    ...play,
    players: play.players.filter((p) => p.id !== playerId),
    branches: play.branches.map((branch) => {
      const kept = Object.fromEntries(Object.entries(branch.tracks).filter(([key]) => key !== playerId));
      // Rebuilding through fromEntries loses the required 'ball' key, so it is restated.
      const tracks = { ...kept, ball: branch.tracks.ball };

      return {
        ...branch,
        tracks,
        screens: branch.screens.filter((s) => s.screenerId !== playerId && s.beneficiaryId !== playerId),
      };
    }),
  };
}

export type FormationIds = { offense: PlayerId[]; defense: PlayerId[] };

// Builds the whole roster in one pass rather than calling addPlayer ten times, so the ball
// can be attached in the same immutable step and the result is valid at once.
export function applyFormation(play: Play, ids: FormationIds): Play {
  const players: Player[] = [];
  const tracks: Record<string, { t: number; position?: Vec2; attachedTo?: PlayerId }[]> = {};

  for (const team of ['offense', 'defense'] as const) {
    const positions = FORMATION[team];
    ids[team].forEach((id, index) => {
      const position = positions[index];
      if (position === undefined) return;
      players.push({ id, team, label: nextLabel([...play.players, ...players], team) });
      tracks[id] = [{ t: 0, position }];
    });
  }

  const pointGuard = ids.offense[0];
  if (pointGuard !== undefined) tracks.ball = [{ t: 0, attachedTo: pointGuard }];

  return {
    ...play,
    players: [...play.players, ...players],
    branches: mapRoot(play, (branch) => ({ ...branch, tracks: { ...branch.tracks, ...tracks } })),
  };
}
