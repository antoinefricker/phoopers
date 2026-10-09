import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { BranchId, Play, PlayerId, ScreenId, StepId } from '../engine';
import { validatePlay } from '../engine';
import * as mutations from './mutations';
import { EditorContext, type EditorContextValue, type Selection } from './useEditorContext';

interface Props {
  initialPlay: Play;
  children: ReactNode;
}

const newId = <T extends string>(): T => crypto.randomUUID() as T;

// Not split by update rate, unlike playback: an edit lands once per gesture, never per frame.
// Ids are minted here so every mutation stays a pure function of its arguments.
export function EditorContextProvider({ initialPlay, children }: Props) {
  const [play, setPlay] = useState(initialPlay);
  const [mode, setMode] = useState<'play' | 'edit'>('play');
  const [selection, select] = useState<Selection>(null);
  const issues = useMemo(() => validatePlay(play), [play]);

  const addPlayer = useCallback<EditorContextValue['addPlayer']>((team) => {
    setPlay((current) => mutations.addPlayer(current, team, newId<PlayerId>()));
  }, []);
  const applyFormation = useCallback<EditorContextValue['applyFormation']>(() => {
    setPlay((current) =>
      mutations.applyFormation(current, {
        offense: Array.from({ length: 5 }, () => newId<PlayerId>()),
        defense: Array.from({ length: 5 }, () => newId<PlayerId>()),
      }),
    );
  }, []);
  const removePlayer = useCallback<EditorContextValue['removePlayer']>((playerId) => {
    setPlay((current) => mutations.removePlayer(current, playerId));
  }, []);
  const setKeyframe = useCallback<EditorContextValue['setKeyframe']>((branchId, entityId, t, position) => {
    setPlay((current) => mutations.setKeyframe(current, branchId, entityId, t, position));
  }, []);
  const attachBall = useCallback<EditorContextValue['attachBall']>((branchId, t, playerId) => {
    setPlay((current) => mutations.attachBall(current, branchId, t, playerId));
  }, []);
  const releaseBall = useCallback<EditorContextValue['releaseBall']>((branchId, t, position) => {
    setPlay((current) => mutations.releaseBall(current, branchId, t, position));
  }, []);
  const moveKeyframe = useCallback<EditorContextValue['moveKeyframe']>((branchId, entityId, fromT, toT) => {
    setPlay((current) => mutations.moveKeyframe(current, branchId, entityId, fromT, toT));
  }, []);
  const removeKeyframe = useCallback<EditorContextValue['removeKeyframe']>((branchId, entityId, t) => {
    setPlay((current) => mutations.removeKeyframe(current, branchId, entityId, t));
  }, []);
  const addStep = useCallback<EditorContextValue['addStep']>((branchId, t, name) => {
    setPlay((current) => mutations.addStep(current, branchId, t, name, newId<StepId>()));
  }, []);
  const renameStep = useCallback<EditorContextValue['renameStep']>((stepId, name) => {
    setPlay((current) => mutations.renameStep(current, stepId, name));
  }, []);
  const moveStep = useCallback<EditorContextValue['moveStep']>((stepId, t) => {
    setPlay((current) => mutations.moveStep(current, stepId, t));
  }, []);
  const removeStep = useCallback<EditorContextValue['removeStep']>((stepId) => {
    setPlay((current) => mutations.removeStep(current, stepId));
  }, []);
  const addScreen = useCallback<EditorContextValue['addScreen']>((branchId, t, screenerId, beneficiaryId) => {
    setPlay((current) => mutations.addScreen(current, branchId, t, screenerId, beneficiaryId, newId<ScreenId>()));
  }, []);
  const setScreenDuration = useCallback<EditorContextValue['setScreenDuration']>((screenId, duration) => {
    setPlay((current) => mutations.setScreenDuration(current, screenId, duration));
  }, []);
  const removeScreen = useCallback<EditorContextValue['removeScreen']>((screenId) => {
    setPlay((current) => mutations.removeScreen(current, screenId));
  }, []);
  const forkBranch = useCallback<EditorContextValue['forkBranch']>((parentBranchId, forkStepId, name) => {
    setPlay((current) => mutations.forkBranch(current, parentBranchId, forkStepId, name, newId<BranchId>()));
  }, []);
  const removeBranch = useCallback<EditorContextValue['removeBranch']>((branchId) => {
    setPlay((current) => mutations.removeBranch(current, branchId));
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      play,
      mode,
      setMode,
      selection,
      select,
      issues,
      addPlayer,
      applyFormation,
      removePlayer,
      setKeyframe,
      attachBall,
      releaseBall,
      moveKeyframe,
      removeKeyframe,
      addStep,
      renameStep,
      moveStep,
      removeStep,
      addScreen,
      setScreenDuration,
      removeScreen,
      forkBranch,
      removeBranch,
    }),
    [
      play,
      mode,
      selection,
      issues,
      addPlayer,
      applyFormation,
      removePlayer,
      setKeyframe,
      attachBall,
      releaseBall,
      moveKeyframe,
      removeKeyframe,
      addStep,
      renameStep,
      moveStep,
      removeStep,
      addScreen,
      setScreenDuration,
      removeScreen,
      forkBranch,
      removeBranch,
    ],
  );

  return <EditorContext value={value}>{children}</EditorContext>;
}
