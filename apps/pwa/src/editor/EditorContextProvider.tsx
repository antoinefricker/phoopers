import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { BranchId, Play, PlayId, PlayerId, ScreenId, StepId } from '../engine';
import { validatePlay } from '../engine';
import { LINEUPS } from './lineups';
import * as mutations from './mutations';
import { EditorContext, type EditorContextValue, type Selection } from './useEditorContext';

interface Props {
  initialPlay: Play;
  children: ReactNode;
}

const newId = <T extends string>(): T => crypto.randomUUID() as T;

/**
 * How long a brand-new system is, in seconds.
 *
 * A floor, not a cap. Without it the timeline of a system nobody has animated yet has no width
 * at all, and there is nowhere to drop the first keyframe.
 */
export const NEW_PLAY_DURATION = 8;

// Not split by update rate, unlike playback: an edit lands once per gesture, never per frame.
// Ids are minted here so every mutation stays a pure function of its arguments.
export function EditorContextProvider({ initialPlay, children }: Props) {
  const [play, setPlay] = useState(initialPlay);
  const [mode, setMode] = useState<'play' | 'edit'>('play');
  const [selection, setSelection] = useState<Selection>(null);
  const [placingScreen, setPlacingScreen] = useState(false);
  const issues = useMemo(() => validatePlay(play), [play]);

  const select = useCallback<EditorContextValue['select']>((next) => {
    setSelection(next);
    setPlacingScreen(false);
  }, []);
  // An armed screen placement waits for the next court click. Leaving Edit mode strands it, so
  // returning would consume a click the coach means as a fresh gesture.
  const changeMode = useCallback<EditorContextValue['setMode']>((next) => {
    setMode(next);
    setPlacingScreen(false);
  }, []);
  const renamePlay = useCallback<EditorContextValue['renamePlay']>((name) => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    setPlay((current) => (current.name === trimmed ? current : { ...current, name: trimmed }));
  }, []);
  const addPlayer = useCallback<EditorContextValue['addPlayer']>((team) => {
    setPlay((current) => mutations.addPlayer(current, team, newId<PlayerId>()));
  }, []);
  const removePlayer = useCallback<EditorContextValue['removePlayer']>((playerId) => {
    setPlay((current) => mutations.removePlayer(current, playerId));
  }, []);
  const renamePlayer = useCallback<EditorContextValue['renamePlayer']>((playerId, label) => {
    setPlay((current) => mutations.renamePlayer(current, playerId, label));
  }, []);
  const movePlayer = useCallback<EditorContextValue['movePlayer']>((playerId, toIndex) => {
    setPlay((current) => mutations.movePlayer(current, playerId, toIndex));
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
  const setStepDuration = useCallback<EditorContextValue['setStepDuration']>((stepId, duration) => {
    setPlay((current) => mutations.setStepDuration(current, stepId, duration));
  }, []);
  const removeScreen = useCallback<EditorContextValue['removeScreen']>((screenId) => {
    setPlay((current) => mutations.removeScreen(current, screenId));
  }, []);
  // The id is minted before the update, outside the updater, so the caller learns which branch it
  // created (to select it) and a StrictMode double-invoked updater cannot mint a second one. The
  // mutation is run against the current play first: a refused fork returns null rather than an
  // id naming a branch that does not exist.
  const forkBranch = useCallback<EditorContextValue['forkBranch']>(
    (parentBranchId, forkStepId, name) => {
      const id = newId<BranchId>();
      if (mutations.forkBranch(play, parentBranchId, forkStepId, name, id) === play) return null;
      setPlay((current) => mutations.forkBranch(current, parentBranchId, forkStepId, name, id));

      return id;
    },
    [play],
  );
  const removeBranch = useCallback<EditorContextValue['removeBranch']>((branchId) => {
    setPlay((current) => mutations.removeBranch(current, branchId));
  }, []);

  // A fresh play id is what makes `PlayView` remount its playback provider, so the clock and the
  // selected branch cannot outlive the play they pointed into.
  const createPlay = useCallback<EditorContextValue['createPlay']>(
    (options) => {
      const seats = LINEUPS[options.lineup];
      setPlay(() =>
        mutations.createPlay(
          { ...options, duration: NEW_PLAY_DURATION },
          {
            playId: newId<PlayId>(),
            rootBranchId: newId<BranchId>(),
            offense: seats.offense.map(() => newId<PlayerId>()),
            defense: seats.defense.map(() => newId<PlayerId>()),
          },
        ),
      );
      select(null);
    },
    [select],
  );

  const value = useMemo<EditorContextValue>(
    () => ({
      play,
      mode,
      setMode: changeMode,
      selection,
      select,
      placingScreen,
      setPlacingScreen,
      issues,
      renamePlay,
      addPlayer,
      removePlayer,
      renamePlayer,
      movePlayer,
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
      setStepDuration,
      removeScreen,
      forkBranch,
      removeBranch,
      createPlay,
    }),
    [
      play,
      mode,
      changeMode,
      selection,
      select,
      placingScreen,
      issues,
      renamePlay,
      addPlayer,
      removePlayer,
      renamePlayer,
      movePlayer,
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
      setStepDuration,
      removeScreen,
      forkBranch,
      removeBranch,
      createPlay,
    ],
  );

  return <EditorContext value={value}>{children}</EditorContext>;
}
