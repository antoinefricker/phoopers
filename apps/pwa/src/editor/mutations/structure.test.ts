import { describe, expect, it } from 'vitest';
import type { BranchId, PlayerId, ScreenId, StepId } from '../../engine';
import { validatePlay } from '../../engine';
import { fixturePlay, P1, P2, ROOT, SCREEN_1, STEP_ENTRY, SWITCH } from '../../engine/__fixtures__/play';
import {
  addScreen,
  addStep,
  descendantsOf,
  forkBranch,
  moveStep,
  removeBranch,
  removeScreen,
  removeStep,
  renameStep,
  setScreenDuration,
} from './structure';

const NEW_STEP = 'step-new' as StepId;
const steps = (play: typeof fixturePlay, id = ROOT) => play.branches.find((b) => b.id === id)?.steps ?? [];
const screens = (play: typeof fixturePlay, id = ROOT) => play.branches.find((b) => b.id === id)?.screens ?? [];

describe('addStep', () => {
  it('adds a named step on the branch, in time order', () => {
    const play = addStep(fixturePlay, ROOT, 1, 'Dribble up', NEW_STEP);

    expect(steps(play).map((s) => s.name)).toEqual(['Dribble up', 'Entry pass']);
    expect(validatePlay(play)).toEqual([]);
  });

  it('does not mutate its input', () => {
    const snapshot = structuredClone(fixturePlay);
    addStep(fixturePlay, ROOT, 1, 'Dribble up', NEW_STEP);

    expect(fixturePlay).toEqual(snapshot);
  });

  it('refuses a non-finite, negative or before-fork time', () => {
    expect(addStep(fixturePlay, ROOT, Number.NaN, 'Bad', NEW_STEP)).toEqual(fixturePlay);
    expect(addStep(fixturePlay, ROOT, Infinity, 'Bad', NEW_STEP)).toEqual(fixturePlay);
    expect(addStep(fixturePlay, ROOT, -1, 'Bad', NEW_STEP)).toEqual(fixturePlay);
    expect(addStep(fixturePlay, SWITCH, 1, 'Bad', NEW_STEP)).toEqual(fixturePlay);
  });
});

describe('renameStep and moveStep', () => {
  it('renames a step', () => {
    expect(steps(renameStep(fixturePlay, STEP_ENTRY, 'Skip pass'))[0]?.name).toBe('Skip pass');
  });

  it('moves a step and keeps ascending order', () => {
    const withTwo = addStep(fixturePlay, ROOT, 3, 'Later', NEW_STEP);
    const play = moveStep(withTwo, STEP_ENTRY, 3.5);

    expect(steps(play).map((s) => s.id)).toEqual([NEW_STEP, STEP_ENTRY]);
  });

  it('refuses a non-finite or negative time', () => {
    expect(moveStep(fixturePlay, STEP_ENTRY, Number.NaN)).toEqual(fixturePlay);
    expect(moveStep(fixturePlay, STEP_ENTRY, -1)).toEqual(fixturePlay);
  });
});

describe('removeStep', () => {
  it('removes an unreferenced step', () => {
    const withStep = addStep(fixturePlay, ROOT, 1, 'Extra', NEW_STEP);

    expect(steps(removeStep(withStep, NEW_STEP)).map((s) => s.id)).toEqual([STEP_ENTRY]);
  });

  it('refuses to remove a step a branch forks from', () => {
    expect(removeStep(fixturePlay, STEP_ENTRY)).toEqual(fixturePlay);
  });
});

describe('addScreen', () => {
  it('adds a screen linking two players', () => {
    const play = addScreen(fixturePlay, ROOT, 1, P2, P1, 'screen-new' as ScreenId);

    expect(screens(play).some((s) => s.screenerId === P2 && s.beneficiaryId === P1 && s.t === 1)).toBe(true);
    expect(validatePlay(play)).toEqual([]);
  });

  it('refuses a screener who screens themselves', () => {
    expect(addScreen(fixturePlay, ROOT, 1, P1, P1, 'screen-new' as ScreenId)).toEqual(fixturePlay);
  });

  it('refuses an unknown player', () => {
    const ghost = 'ghost' as PlayerId;

    expect(addScreen(fixturePlay, ROOT, 1, ghost, P1, 'screen-new' as ScreenId)).toEqual(fixturePlay);
    expect(addScreen(fixturePlay, ROOT, 1, P1, ghost, 'screen-new' as ScreenId)).toEqual(fixturePlay);
  });

  it('refuses a non-finite, negative or before-fork time', () => {
    const id = 'screen-new' as ScreenId;

    expect(addScreen(fixturePlay, ROOT, Number.NaN, P2, P1, id)).toEqual(fixturePlay);
    expect(addScreen(fixturePlay, ROOT, -1, P2, P1, id)).toEqual(fixturePlay);
    expect(addScreen(fixturePlay, SWITCH, 1, P2, P1, id)).toEqual(fixturePlay);
  });
});

describe('setScreenDuration and removeScreen', () => {
  it('sets the duration', () => {
    expect(screens(setScreenDuration(fixturePlay, SCREEN_1, 2.5))[0]?.duration).toBe(2.5);
  });

  it('refuses a non-positive or non-finite duration', () => {
    expect(setScreenDuration(fixturePlay, SCREEN_1, 0)).toEqual(fixturePlay);
    expect(setScreenDuration(fixturePlay, SCREEN_1, -1)).toEqual(fixturePlay);
    expect(setScreenDuration(fixturePlay, SCREEN_1, Number.NaN)).toEqual(fixturePlay);
    expect(setScreenDuration(fixturePlay, SCREEN_1, Infinity)).toEqual(fixturePlay);
  });

  it('removes a screen', () => {
    expect(screens(removeScreen(fixturePlay, SCREEN_1))).toEqual([]);
  });
});

describe('forkBranch', () => {
  it('creates a branch with an empty ball track that forks from the step', () => {
    const id = 'variant' as BranchId;
    const play = forkBranch(fixturePlay, ROOT, STEP_ENTRY, 'Variant', id);
    const created = play.branches.find((b) => b.id === id);

    expect(created?.parentId).toBe(ROOT);
    expect(created?.forkStepId).toBe(STEP_ENTRY);
    expect(created?.tracks).toEqual({ ball: [] });
    expect(validatePlay(play)).toEqual([]);
  });

  it('refuses a fork step that is not on the parent chain', () => {
    expect(forkBranch(fixturePlay, ROOT, 'ghost' as StepId, 'Variant', 'variant' as BranchId)).toEqual(fixturePlay);
  });

  it('refuses a duplicate branch id', () => {
    expect(forkBranch(fixturePlay, ROOT, STEP_ENTRY, 'Dup', SWITCH)).toEqual(fixturePlay);
  });
});

describe('removeBranch', () => {
  it('removes the branch and every descendant', () => {
    const grandchild = 'grandchild' as BranchId;
    const withGrandchild = forkBranch(fixturePlay, SWITCH, STEP_ENTRY, 'Deeper', grandchild);

    const play = removeBranch(withGrandchild, SWITCH);

    expect(play.branches.map((b) => b.id)).toEqual([ROOT]);
    expect(validatePlay(play)).toEqual([]);
  });

  it('refuses to remove the root branch', () => {
    expect(removeBranch(fixturePlay, ROOT)).toEqual(fixturePlay);
  });

  it('lists descendants without the branch itself', () => {
    expect(descendantsOf(fixturePlay, ROOT)).toContain(SWITCH);
    expect(descendantsOf(fixturePlay, ROOT)).not.toContain(ROOT);
  });
});
