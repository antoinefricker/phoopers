import { Button, Group, SegmentedControl } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useEditorContext } from './useEditorContext';

export function EditorToolbar() {
  const { t } = useTranslation();
  const { mode, setMode, addPlayer, applyFormation } = useEditorContext();

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
        </>
      )}
    </Group>
  );
}
