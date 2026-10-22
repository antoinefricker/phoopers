import { useCallback } from 'react';
import { MODE_SHORTCUT } from './editorShortcuts';
import { useEditorContext } from './useEditorContext';
import { useEditorShortcut } from './useEditorShortcut';

/** Switches between watching a system and authoring it, on the editor's mode chord. */
export function useModeShortcut(): void {
  const { mode, setMode } = useEditorContext();
  const toggle = useCallback(() => setMode(mode === 'play' ? 'edit' : 'play'), [mode, setMode]);

  useEditorShortcut(MODE_SHORTCUT, toggle);
}
