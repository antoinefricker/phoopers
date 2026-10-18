import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fetchProfile } from '../auth/profileApi';
import { useAuthContext } from '../auth/useAuthContext';
import { profileKey, useProfile } from '../auth/useProfile';
import { fingerprint } from '../draft/draftStorage';
import { useDraftContext } from '../draft/useDraftContext';
import type { PlayId } from '../engine';
import { fetchPlay, hasActiveSession } from '../plays/playsApi';
import { useSavePlay } from '../plays/usePlays';
import type { SaveKind } from './SavePlayDialog';
import { useEditorContext } from './useEditorContext';

/** The address's flag that sends a coach back to the save dialog after signing in. */
const SAVE_PARAM = 'save';

/**
 * Everything saving needs to decide, in the spec's order: a system never stored asks for an
 * account if there is none, then names itself in a dialog and is inserted; one the signer owns is
 * overwritten with no dialog; one someone else owns can only be copied, privately, under a new id.
 *
 * A write that fails changes nothing: the draft is the coach's work and stays as it is. An
 * overwrite that fails because its row is gone (deleted elsewhere, while a resumed draft still
 * remembers where it came from) falls back to the dialog, which stores it again under the same id.
 */
export function useSaveSystem() {
  const { t } = useTranslation();
  const { play, renamePlay } = useEditorContext();
  const { origin, isDirty, markSaved } = useDraftContext();
  const { status, userId, configured } = useAuthContext();
  const profile = useProfile();
  const writer = useSavePlay();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  // Re-keyed on every open so the dialog starts from the current name without an effect.
  const [dialog, setDialog] = useState<{ opened: boolean; count: number; kind: SaveKind; copyId: PlayId }>({
    opened: false,
    count: 0,
    kind: 'first',
    copyId: crypto.randomUUID() as PlayId,
  });
  const [overwriteFailed, setOverwriteFailed] = useState(false);
  const [overwriting, setOverwriting] = useState(false);
  const [resumed, setResumed] = useState(() => params.has(SAVE_PARAM));

  const signedIn = status === 'signedIn' && userId !== null;
  const needsName = profile.isSuccess && profile.data === null;
  const ownedBySigner = origin !== null && origin.ownerId === userId;
  const kindOfWrite: SaveKind | 'overwrite' = origin === null ? 'first' : ownedBySigner ? 'overwrite' : 'copy';
  const copying = (dialog.opened ? dialog.kind : kindOfWrite) === 'copy';

  // Only a copy names someone else; the author's profile is readable by everyone.
  const author = useQuery({
    queryKey: profileKey(origin?.ownerId ?? null),
    queryFn: () => fetchProfile(origin?.ownerId as string),
    enabled: copying && origin !== null,
  });

  const returning = resumed && signedIn && !needsName && kindOfWrite !== 'overwrite';
  const opened = dialog.opened || returning;
  const kind: SaveKind = dialog.opened ? dialog.kind : kindOfWrite === 'overwrite' ? 'first' : kindOfWrite;

  const returnPath = `${origin === null ? '/play' : pathname}?${SAVE_PARAM}=1`;

  const forgetReturn = () => {
    setResumed(false);
    if (params.has(SAVE_PARAM)) {
      const next = new URLSearchParams(params);
      next.delete(SAVE_PARAM);
      setParams(next, { replace: true });
    }
  };

  const overwrite = async () => {
    if (origin === null || userId === null) return;
    setOverwriteFailed(false);
    setOverwriting(true);
    try {
      await writer.mutateAsync({ play });
      markSaved({ ownerId: userId, isPublic: origin.isPublic, fingerprint: fingerprint(play) });
    } catch {
      let gone = false;
      try {
        // A lapsed session hides the coach's own private row too: only a live one can say it is gone.
        gone = (await fetchPlay(play.id)) === null && (await hasActiveSession());
      } catch {
        // Not knowing is treated as a plain failure: the coach can try again.
      }
      if (gone) {
        writer.reset();
        setDialog((d) => ({ ...d, opened: true, count: d.count + 1, kind: 'restore' }));
      } else setOverwriteFailed(true);
    } finally {
      setOverwriting(false);
    }
  };

  // Back from signing in on a system the signer owns there is no dialog to open, so the pending
  // save is carried out here, once.
  const honoured = useRef(false);
  useEffect(() => {
    if (!resumed || !signedIn || !ownedBySigner || honoured.current) return;
    honoured.current = true;
    // Started from a promise, not the effect body: it only sets state once the write is under way.
    void Promise.resolve().then(() => {
      forgetReturn();
      if (isDirty) return overwrite();
    });
  });

  /** Called by the menu's Save entry; returns true when the menu should close. */
  const start = (): boolean => {
    setOverwriteFailed(false);
    if (status === 'signedOut') {
      void navigate(`/signin?next=${encodeURIComponent(returnPath)}`);
      return true;
    }
    if (!signedIn) return false;
    if (kindOfWrite === 'overwrite') {
      void overwrite();
      return false;
    }
    if (needsName) {
      void navigate(`/auth/callback?next=${encodeURIComponent(returnPath)}`);
      return true;
    }
    setDialog((d) => ({
      opened: true,
      count: d.count + 1,
      kind: kindOfWrite,
      copyId: crypto.randomUUID() as PlayId,
    }));
    return true;
  };

  const close = () => {
    setDialog((d) => ({ ...d, opened: false }));
    forgetReturn();
    writer.reset();
  };

  const submit = async ({ name, isPublic }: { name: string; isPublic: boolean }) => {
    if (userId === null) return;
    if (needsName) {
      void navigate(`/auth/callback?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    try {
      if (kind === 'copy') {
        const copy = { ...play, id: dialog.copyId, name };
        await writer.mutateAsync({ play: copy, insert: { ownerId: userId, isPublic: false } });
        close();
        // The copy is a different system with its own address; the draft follows it there.
        void navigate(`/play/${copy.id}`);
        return;
      }
      const named = { ...play, name };
      await writer.mutateAsync({ play: named, insert: { ownerId: userId, isPublic } });
      renamePlay(name);
      markSaved({ ownerId: userId, isPublic, fingerprint: fingerprint(named) });
      close();
    } catch {
      // `writer.isError` carries it to the dialog; nothing to undo.
    }
  };

  return {
    isDirty,
    /** Nothing can be saved without a Supabase project, nor before the session is known. */
    disabled: !configured || status === 'loading',
    busy: overwriting,
    overwriteFailed,
    start,
    dialogKey: dialog.count,
    dialogProps: {
      opened,
      kind,
      initialName: kind === 'copy' ? t('mine.copyName', '{{name}} (copy)', { name: play.name }) : play.name,
      initialPublic: origin?.isPublic ?? false,
      authorName: author.data?.displayName,
      pending: writer.isPending,
      failed: writer.isError,
      onSubmit: (choice: { name: string; isPublic: boolean }) => void submit(choice),
      onClose: close,
    },
  };
}
