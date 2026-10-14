import { EASING_PRESETS } from './easing';
import type { Branch, Issue, IssueCode, Keyframe, Play, PlayerId } from './types';

function issue(code: IssueCode, message: string, entityId?: string): Issue {
  return entityId === undefined ? { code, message } : { code, message, entityId };
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated];
}

function ancestorChain(play: Play, branch: Branch): Branch[] | 'cycle' {
  const byId = new Map(play.branches.map((b) => [b.id, b]));
  const chain: Branch[] = [];
  const seen = new Set<string>();
  let current: Branch | undefined = branch;

  while (current !== undefined) {
    if (seen.has(current.id)) return 'cycle';
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  return chain;
}

function forkTime(chain: readonly Branch[], branch: Branch): number | undefined {
  if (branch.forkStepId === null) return 0;
  for (const ancestor of chain) {
    if (ancestor.id === branch.id) break;
    const step = ancestor.steps.find((s) => s.id === branch.forkStepId);
    if (step !== undefined) return step.t;
  }
  return undefined;
}

function checkKeyframes(
  entity: string,
  keyframes: readonly Keyframe[],
  knownPlayers: ReadonlySet<string>,
  branchId: string,
  fork: number | undefined,
  issues: Issue[],
): void {
  const isBall = entity === 'ball';
  let previous = Number.NEGATIVE_INFINITY;

  for (const keyframe of keyframes) {
    if (keyframe.t <= previous) {
      issues.push(issue('keyframe-times-not-monotonic', `${entity} keyframes are not ascending`, branchId));
    }
    previous = keyframe.t;

    if (fork !== undefined && keyframe.t < fork) {
      issues.push(issue('keyframe-before-fork', `${entity} has a keyframe before the fork`, branchId));
    }

    if (isBall) {
      if (keyframe.position === undefined && keyframe.attachedTo === undefined) {
        issues.push(issue('ball-keyframe-missing-position', 'ball keyframe has no state', branchId));
      }
      if (keyframe.position !== undefined && keyframe.attachedTo !== undefined) {
        issues.push(issue('ball-keyframe-position-and-attachment', 'ball keyframe has both', branchId));
      }
      if (keyframe.attachedTo !== undefined && !knownPlayers.has(keyframe.attachedTo)) {
        issues.push(issue('unknown-player-reference', `unknown player ${keyframe.attachedTo}`, branchId));
      }
    } else if (keyframe.attachedTo !== undefined) {
      issues.push(issue('player-keyframe-has-attachment', `${entity} keyframe has attachedTo`, branchId));
    }

    const numbers: number[] = [keyframe.t];
    for (const point of [keyframe.position, keyframe.handleIn, keyframe.handleOut]) {
      if (point !== undefined) numbers.push(point.x, point.y);
    }
    const ease = keyframe.ease;
    if (ease !== undefined && typeof ease !== 'string') numbers.push(ease.x1, ease.y1, ease.x2, ease.y2);
    if (!numbers.every(Number.isFinite)) {
      issues.push(issue('non-finite-number', `${entity} keyframe has a non-finite number`, branchId));
    }

    if (typeof ease === 'string' && !Object.hasOwn(EASING_PRESETS, ease)) {
      issues.push(issue('unknown-easing-preset', `${entity} easing "${ease}" is not a preset`, branchId));
    }
    if (ease !== undefined && typeof ease !== 'string') {
      if (ease.x1 < 0 || ease.x1 > 1 || ease.x2 < 0 || ease.x2 > 1) {
        issues.push(issue('easing-out-of-range', `${entity} easing x is outside [0, 1]`, branchId));
      }
    }
  }
}

function collectIssues(play: Play, issues: Issue[]): void {
  const knownPlayers = new Set<string>(play.players.map((p) => p.id));
  // How long the play is: its last keyframe. A label window may not outlast it, there being no
  // time past it for the transport to reach.
  const playDuration = Math.max(
    0,
    ...play.branches.flatMap((b) => Object.values(b.tracks).flatMap((track) => track.map((k) => k.t))),
  );

  for (const id of duplicates(play.players.map((p) => p.id))) {
    issues.push(issue('duplicate-id', `duplicate player id ${id}`, id));
  }
  for (const id of duplicates(play.branches.map((b) => b.id))) {
    issues.push(issue('duplicate-id', `duplicate branch id ${id}`, id));
  }
  for (const id of duplicates(play.branches.flatMap((b) => b.steps.map((s) => s.id)))) {
    issues.push(issue('duplicate-id', `duplicate step id ${id}`, id));
  }
  for (const id of duplicates(play.branches.flatMap((b) => b.screens.map((s) => s.id)))) {
    issues.push(issue('duplicate-id', `duplicate screen id ${id}`, id));
  }

  if (!play.branches.some((b) => b.id === play.rootBranchId)) {
    issues.push(issue('unknown-root-branch', `root branch ${play.rootBranchId} not found`));
  }
  const branchIds = new Set<string>(play.branches.map((b) => b.id));

  for (const branch of play.branches) {
    const isRoot = branch.id === play.rootBranchId;

    if (isRoot && branch.parentId !== null) {
      issues.push(issue('root-branch-with-parent', 'the root branch has a parent', branch.id));
    }
    if (isRoot && branch.forkStepId !== null) {
      issues.push(issue('root-branch-with-fork', 'the root branch has a fork step', branch.id));
    }
    const dangling = branch.parentId !== null && !branchIds.has(branch.parentId);
    if (dangling) {
      issues.push(issue('dangling-parent-branch', `parent branch ${branch.parentId} not found`, branch.id));
    }
    if (!isRoot && branch.forkStepId === null) {
      issues.push(issue('non-root-branch-without-fork', 'a non-root branch has no fork step', branch.id));
    }

    const chain = ancestorChain(play, branch);
    if (chain === 'cycle') {
      issues.push(issue('branch-cycle', 'branch parents form a cycle', branch.id));
      continue;
    }

    const fork = isRoot ? 0 : forkTime(chain, branch);
    if (!isRoot && fork === undefined && !dangling) {
      issues.push(issue('fork-step-not-in-ancestors', `fork step ${branch.forkStepId} not found`, branch.id));
    }

    for (const screen of branch.screens) {
      for (const playerId of [screen.screenerId, screen.beneficiaryId] as PlayerId[]) {
        if (!knownPlayers.has(playerId)) {
          issues.push(issue('unknown-player-reference', `unknown player ${playerId}`, screen.id));
        }
      }
    }

    // A label's window may not reach the next step's instant, nor the end of the play. The
    // editor's handle cannot produce either, but a retime or an inserted step can, so the state
    // is reported rather than assumed away. Judged per branch: two branches' steps are never
    // shown together, so one's step does not bound the other's window.
    const ordered = [...branch.steps].sort((a, b) => a.t - b.t);
    ordered.forEach((step, index) => {
      if (step.duration === undefined) return;
      if (!Number.isFinite(step.duration) || step.duration <= 0) {
        issues.push(issue('step-duration-not-positive', `step ${step.id} has a non-positive duration`, step.id));

        return;
      }
      const limit = ordered[index + 1]?.t ?? playDuration;
      if (step.t + step.duration > limit) {
        issues.push(issue('step-label-window-overruns', `step ${step.id} label outlasts its window`, step.id));
      }
    });

    for (const [entity, keyframes] of Object.entries(branch.tracks)) {
      checkKeyframes(entity, keyframes, knownPlayers, branch.id, fork, issues);
    }
  }
}

/**
 * Reports structural problems the type system cannot catch. Never throws: input that is
 * malformed beyond what the checks can traverse yields the issues found before the failure
 * plus a `malformed-play` issue.
 */
export function validatePlay(play: Play): Issue[] {
  const issues: Issue[] = [];
  try {
    collectIssues(play, issues);
  } catch (error) {
    // Validation stops here. Report it rather than implying the play is clean.
    const reason = error instanceof Error ? error.message : String(error);
    issues.push(issue('malformed-play', `play is structurally malformed: ${reason}`));
  }
  return issues;
}
