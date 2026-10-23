import { createContext, useContext } from 'react';
import type { BranchId, EntityId, Issue, Play, PlayerId, ScreenId, StepId, Vec2 } from '../engine';
import type { CreatePlayOptions } from './mutations';

export type Selection =
  { kind: 'entity'; entityId: EntityId } | { kind: 'keyframe'; entityId: EntityId; t: number } | null;

export interface EditorContextValue {
  play: Play;
  mode: 'play' | 'edit';
  setMode: (mode: 'play' | 'edit') => void;
  selection: Selection;
  /** Changing the selection also cancels a pending screen placement: it was about the old one. */
  select: (selection: Selection) => void;
  /**
   * True between choosing "Place a screen" and the court click that names the beneficiary. The
   * screener is the selected player. Lives here, not in a component, because the control that
   * starts it (`SelectionActions`) and the court layer that finishes it are far apart.
   */
  placingScreen: boolean;
  setPlacingScreen: (placing: boolean) => void;
  issues: Issue[];
  /** The system's own name, as saved. Trimmed; a name of nothing but spaces changes nothing. */
  renamePlay: (name: string) => void;
  addPlayer: (team: 'offense' | 'defense') => void;
  removePlayer: (playerId: PlayerId) => void;
  /** The coach's own name for a player. An empty one takes the name back rather than storing it. */
  renamePlayer: (playerId: PlayerId, label: string) => void;
  /** Where a player sits in the roster, which is the order of the timeline's rows. */
  movePlayer: (playerId: PlayerId, toIndex: number) => void;
  setKeyframe: (branchId: BranchId, entityId: EntityId, t: number, position: Vec2) => void;
  attachBall: (branchId: BranchId, t: number, playerId: PlayerId) => void;
  releaseBall: (branchId: BranchId, t: number, position: Vec2) => void;
  moveKeyframe: (branchId: BranchId, entityId: EntityId, fromT: number, toT: number) => void;
  removeKeyframe: (branchId: BranchId, entityId: EntityId, t: number) => void;
  addStep: (branchId: BranchId, t: number, name: string) => void;
  renameStep: (stepId: StepId, name: string) => void;
  moveStep: (stepId: StepId, t: number) => void;
  removeStep: (stepId: StepId) => void;
  addScreen: (branchId: BranchId, t: number, screenerId: PlayerId, beneficiaryId: PlayerId) => void;
  setScreenDuration: (screenId: ScreenId, duration: number) => void;
  /** How long a step's name is shown for, in seconds from the step's own time. */
  setStepDuration: (stepId: StepId, duration: number) => void;
  removeScreen: (screenId: ScreenId) => void;
  /** Returns the new branch's id, or `null` when the fork was refused (nothing was written). */
  forkBranch: (parentBranchId: BranchId, forkStepId: StepId, name: string) => BranchId | null;
  removeBranch: (branchId: BranchId) => void;
  /**
   * Replaces the whole play with a newly created one: new ids, one root branch holding the
   * chosen starting placement, the default duration, and nothing selected.
   */
  createPlay: (options: Omit<CreatePlayOptions, 'duration'>) => void;
  /**
   * Empties the open system in place: the same id, name, court, extent and length, on a court
   * holding nothing but the ball. Unlike `createPlay` it is still the same system, so a save
   * after it overwrites the row it came from rather than storing a second copy.
   */
  clearPlay: () => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);

  if (value === null) {
    throw new Error('useEditorContext must be used inside an EditorContextProvider');
  }

  return value;
}
