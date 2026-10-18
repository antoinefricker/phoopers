import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEditorContext } from '../editor/useEditorContext';
import { DraftContext } from './useDraftContext';
import { clearDraft, fingerprint, readDraft, writeDraft, type DraftOrigin } from './draftStorage';

interface Props {
  initialOrigin: DraftOrigin | null;
  children: ReactNode;
}

/** What identifies a stored draft: its play and where it came from. */
const draftKey = (playFingerprint: string, origin: DraftOrigin | null) =>
  `${playFingerprint}|${origin ? JSON.stringify(origin) : ''}`;

/**
 * Sits inside `EditorContextProvider` and owns no copy of the play: it only mirrors the open one
 * into the browser and compares it with where it came from.
 */
export function DraftContextProvider({ initialOrigin, children }: Props) {
  const { play } = useEditorContext();
  const [origin, setOrigin] = useState<DraftOrigin | null>(initialOrigin);
  const playFingerprint = useMemo(() => fingerprint(play), [play]);

  // The key of what storage holds, so an unchanged draft is not serialized and written again.
  const written = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (written.current === undefined) {
      const stored = readDraft();
      written.current = stored ? draftKey(fingerprint(stored.play), stored.origin) : null;
    }
    const key = draftKey(playFingerprint, origin);
    if (written.current === key) return;
    writeDraft({ play, origin });
    written.current = key;
  }, [play, playFingerprint, origin]);

  const markSaved = useCallback((saved: DraftOrigin) => setOrigin(saved), []);
  const discard = useCallback(() => {
    clearDraft();
    written.current = null;
  }, []);

  const value = useMemo(
    () => ({
      origin,
      isDirty: origin === null || origin.fingerprint !== playFingerprint,
      markSaved,
      discard,
    }),
    [origin, playFingerprint, markSaved, discard],
  );

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
