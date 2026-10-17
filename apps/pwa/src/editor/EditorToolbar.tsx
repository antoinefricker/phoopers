import { useState } from 'react';
import { Button, Center, Group, SegmentedControl } from '@mantine/core';
import { IconEye, IconPencil } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDelete } from './ConfirmDelete';
import { useEditorContext } from './useEditorContext';

export function EditorToolbar() {
  const { t } = useTranslation();
  const { play, mode, setMode, createPlay } = useEditorContext();
  // The dialog stays mounted. The `key` is a guard for the future: ConfirmDelete is stateless today,
  // so removing it changes nothing, but it makes any state added later reset per open without an effect.
  const [asking, setAsking] = useState({ opened: false, count: 0 });

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
      {mode === 'edit' && (
        <Button variant="default" color="red" onClick={() => setAsking((a) => ({ opened: true, count: a.count + 1 }))}>
          {t('play.editor.newPlay', 'New play')}
        </Button>
      )}
      <ConfirmDelete
        key={asking.count}
        opened={asking.opened}
        title={t('play.editor.newPlayTitle', 'Start a new play?')}
        body={t('play.editor.newPlayBody', 'The current play, with all its branches, will be discarded.')}
        confirmLabel={t('play.editor.newPlayConfirm', 'Start over')}
        onConfirm={() => {
          createPlay({
            name: t('play.editor.newPlayName', 'Untitled play'),
            court: play.court,
            extent: play.extent ?? 'full',
            lineup: 'empty',
          });
          setAsking((a) => ({ ...a, opened: false }));
        }}
        onClose={() => setAsking((a) => ({ ...a, opened: false }))}
      />
    </Group>
  );
}
