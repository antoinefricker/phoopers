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

    const ease = keyframe.ease;
    if (ease !== undefined && typeof ease !== 'string') {
      if (ease.x1 < 0 || ease.x1 > 1 || ease.x2 < 0 || ease.x2 > 1) {
        issues.push(issue('easing-out-of-range', `${entity} easing x is outside [0, 1]`, branchId));
      }
    }
  }
}

function collectIssues(play: Play, issues: Issue[]): void {
  const knownPlayers = new Set<string>(play.players.map((p) => p.id));

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

  for (const branch of play.branches) {
    const isRoot = branch.id === play.rootBranchId;

    if (isRoot && branch.parentId !== null) {
      issues.push(issue('root-branch-with-parent', 'the root branch has a parent', branch.id));
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
    if (!isRoot && fork === undefined) {
      issues.push(issue('fork-step-not-in-ancestors', `fork step ${branch.forkStepId} not found`, branch.id));
    }

    for (const screen of branch.screens) {
      for (const playerId of [screen.screenerId, screen.beneficiaryId] as PlayerId[]) {
        if (!knownPlayers.has(playerId)) {
          issues.push(issue('unknown-player-reference', `unknown player ${playerId}`, screen.id));
        }
      }
    }

    for (const [entity, keyframes] of Object.entries(branch.tracks)) {
      checkKeyframes(entity, keyframes, knownPlayers, branch.id, fork, issues);
    }
  }
}

/**
 * Reports structural problems the type system cannot catch. Never throws: input that is
 * malformed beyond what the checks can traverse yields the issues found before the failure.
 */
export function validatePlay(play: Play): Issue[] {
  const issues: Issue[] = [];
  try {
    collectIssues(play, issues);
  } catch {
    // The editor shows partial results mid-edit rather than crashing.
  }
  return issues;
}
