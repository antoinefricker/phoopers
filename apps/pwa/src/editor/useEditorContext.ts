import { createContext, useContext } from 'react';
import type { BranchId, EntityId, Issue, Play, PlayerId, ScreenId, StepId, Vec2 } from '../engine';

export type Selection =
  { kind: 'entity'; entityId: EntityId } | { kind: 'keyframe'; entityId: EntityId; t: number } | null;

export interface EditorContextValue {
  play: Play;
  mode: 'play' | 'edit';
  setMode: (mode: 'play' | 'edit') => void;
  selection: Selection;
  select: (selection: Selection) => void;
  issues: Issue[];
  addPlayer: (team: 'offense' | 'defense') => void;
  applyFormation: () => void;
  removePlayer: (playerId: PlayerId) => void;
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
  removeScreen: (screenId: ScreenId) => void;
  forkBranch: (parentBranchId: BranchId, forkStepId: StepId, name: string) => void;
  removeBranch: (branchId: BranchId) => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);

  if (value === null) {
    throw new Error('useEditorContext must be used inside an EditorContextProvider');
  }

  return value;
}
