import { Center, Group, SegmentedControl } from '@mantine/core';
import { IconEye, IconPencil } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useEditorContext } from './useEditorContext';

export function EditorToolbar() {
  const { t } = useTranslation();
  const { mode, setMode } = useEditorContext();

  return (
    <Group gap="sm">
      <SegmentedControl
        value={mode}
        onChange={(value) => setMode(value === 'edit' ? 'edit' : 'play')}
        data={[
          // Eye and pencil, not a play triangle: this picks watching versus authoring, while
          // the transport's play button starts the animation. Sharing a glyph would read as
          // two controls for one gesture. The text stays — it is the segment's accessible
          // name, which several tests select these by.
          {
            value: 'play',
            label: (
              <Center style={{ gap: 6 }}>
                <IconEye size={16} stroke={1.5} />
                <span>{t('play.editor.mode.play', 'Play')}</span>
              </Center>
            ),
          },
          {
            value: 'edit',
            label: (
              <Center style={{ gap: 6 }}>
                <IconPencil size={16} stroke={1.5} />
                <span>{t('play.editor.mode.edit', 'Edit')}</span>
              </Center>
            ),
          },
        ]}
      />
    </Group>
  );
}
