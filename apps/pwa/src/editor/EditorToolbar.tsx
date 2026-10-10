import { useState } from 'react';
import { Button, Group, SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ConfirmDelete } from './ConfirmDelete';
import { useEditorContext } from './useEditorContext';

export function EditorToolbar() {
  const { t } = useTranslation();
  const { mode, setMode, addPlayer, applyFormation, newPlay } = useEditorContext();
  // The dialog stays mounted. The `key` is a guard for the future: ConfirmDelete is stateless today,
  // so removing it changes nothing, but it makes any state added later reset per open without an effect.
  const [asking, setAsking] = useState({ opened: false, count: 0 });

  return (
    <Group gap="sm">
      <SegmentedControl
        value={mode}
        onChange={(value) => setMode(value === 'edit' ? 'edit' : 'play')}
        data={[
          { value: 'play', label: t('play.editor.mode.play', 'Play') },
          { value: 'edit', label: t('play.editor.mode.edit', 'Edit') },
        ]}
      />
      {mode === 'edit' && (
        <>
          <Button variant="default" onClick={() => addPlayer('offense')}>
            {t('play.editor.addOffense', 'Add offense')}
          </Button>
          <Button variant="default" onClick={() => addPlayer('defense')}>
            {t('play.editor.addDefense', 'Add defense')}
          </Button>
          <Button variant="default" onClick={applyFormation}>
            {t('play.editor.formation', 'Starting formation')}
          </Button>
          <Button
            variant="default"
            color="red"
            onClick={() => setAsking((a) => ({ opened: true, count: a.count + 1 }))}
          >
            {t('play.editor.newPlay', 'New play')}
          </Button>
        </>
      )}
      <ConfirmDelete
        key={asking.count}
        opened={asking.opened}
        title={t('play.editor.newPlayTitle', 'Start a new play?')}
        body={t('play.editor.newPlayBody', 'The current play, with all its branches, will be discarded.')}
        confirmLabel={t('play.editor.newPlayConfirm', 'Start over')}
        onConfirm={() => {
          newPlay(t('play.editor.newPlayName', 'Untitled play'));
          setAsking((a) => ({ ...a, opened: false }));
        }}
        onClose={() => setAsking((a) => ({ ...a, opened: false }))}
      />
    </Group>
  );
}
