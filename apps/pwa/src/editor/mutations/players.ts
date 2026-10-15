import type { Branch, Play, Player, PlayerId, Vec2 } from '../../engine';
import { COURT_DIMENSIONS, resolveBranch, stateAt } from '../../engine';
import { FORMATION } from '../formation';

// Each side is numbered 1..5 on its own, so both teams hold a player called "2"; the court
// tells them apart by the circle's fill. A number is never reused: the next free integer is one
// past the highest in use, which keeps numbering stable when a middle player is removed.
// The leading "X" is still stripped when reading existing numbers, so a play authored before
// defenders lost the prefix keeps numbering correctly.
// It numbers only; a new player carries no `label`, the coach not having named them yet.
export function nextNumber(players: readonly Player[], team: 'offense' | 'defense'): string {
  const used = players
    .filter((p) => p.team === team)
    .map((p) => Number.parseInt(p.number.replace(/^X/, ''), 10))
    .filter((n) => Number.isFinite(n));
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;

  return String(next);
}

/**
 * Gives a player the coach's own name, or takes it back when they clear the field.
 *
 * A name of nothing but spaces is no name: the property is DROPPED rather than written empty,
 * so `entityName` returns to the side and the number and the play never carries blank strings
 * that would have to be guarded against everywhere they are read.
 *
 * The name is trimmed on the way in. A leading space is a slip, never a choice, and leaving it
 * would make two players called "Pivot" sort and read as different ones.
 */
export function renamePlayer(play: Play, playerId: PlayerId, label: string): Play {
  const trimmed = label.trim();

  return {
    ...play,
    players: play.players.map((player) => {
      if (player.id !== playerId) return player;
      if (trimmed === '') {
        const unnamed = { ...player };
        delete unnamed.label;

        return unnamed;
      }

      return { ...player, label: trimmed };
    }),
  };
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
  const player: Player = { id, team, number: nextNumber(play.players, team) };

  return {
    ...play,
    players: [...play.players, player],
    branches: mapRoot(play, (branch) => ({
      ...branch,
      tracks: { ...branch.tracks, [id]: [{ t: 0, position: centre(play) }] },
    })),
  };
}

/**
 * Removes a player, their tracks, the screens naming them, and their hold on the ball.
 *
 * A ball keyframe attached to them is turned into one at the position they occupied at that
 * instant, resolved from the play as it stands BEFORE the removal. It used to be left alone,
 * on the reasoning that `validatePlay` would report the dangling reference and the coach could
 * reassign possession rather than lose it. What that cost was never measured: the sampler
 * resolves an attached keyframe to its carrier's position, a carrier who no longer exists has
 * none, and the ball was drawn at the court's corner for every instant it was held.
 *
 * Releasing it keeps the ball exactly where it was drawn and leaves a valid play, which a
 * coach can still reassign by dropping the ball on someone.
 */
export function removePlayer(play: Play, playerId: PlayerId): Play {
  if (!play.players.some((p) => p.id === playerId)) return play;

  return {
    ...play,
    players: play.players.filter((p) => p.id !== playerId),
    branches: play.branches.map((branch) => {
      const kept = Object.fromEntries(Object.entries(branch.tracks).filter(([key]) => key !== playerId));
      // Resolved per branch: a child inherits the player's track from its ancestors, so where
      // they were at a given instant is a question only the resolved branch can answer.
      const timeline = resolveBranch(play, branch.id);
      const ball = (branch.tracks.ball ?? []).flatMap((keyframe) => {
        if (keyframe.attachedTo !== playerId) return [keyframe];
        const position = stateAt(timeline, keyframe.t).players[playerId]?.position;
        // No position to release it at — the player had no keyframe anywhere on this branch's
        // chain. Nothing can be invented, so the hold goes with them.
        if (position === undefined) return [];

        const { attachedTo: _attachedTo, ...rest } = keyframe;

        return [{ ...rest, position }];
      });
      // Rebuilding through fromEntries loses the required 'ball' key, so it is restated.
      const tracks = { ...kept, ball };

      return {
        ...branch,
        tracks,
        screens: branch.screens.filter((s) => s.screenerId !== playerId && s.beneficiaryId !== playerId),
      };
    }),
  };
}

/**
 * Moves a player to another place in the roster.
 *
 * The roster's order is the order of the timeline's rows, so this is what a drag between rows
 * writes. Nothing else reads it: a player's tracks, screens and keyframes are keyed by id, so
 * reordering moves rows and touches no play data.
 *
 * `toIndex` is clamped rather than refused: the caller is a drag, and a drop past the last row
 * is something a hand does.
 */
export function movePlayer(play: Play, playerId: PlayerId, toIndex: number): Play {
  const from = play.players.findIndex((p) => p.id === playerId);
  if (from === -1) return play;

  const to = Math.min(Math.max(Math.trunc(toIndex), 0), play.players.length - 1);
  if (to === from) return play;

  const players = [...play.players];
  const [moved] = players.splice(from, 1);
  if (moved === undefined) return play;
  players.splice(to, 0, moved);

  return { ...play, players };
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
      players.push({ id, team, number: nextNumber([...play.players, ...players], team) });
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
