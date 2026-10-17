import { useState } from 'react';
import { ActionIcon, Button, Divider, Popover, Stack, Tooltip } from '@mantine/core';
import { IconEye, IconMenu2, IconPencil } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { CreatePlayDialog } from './CreatePlayDialog';
import { useEditorContext } from './useEditorContext';

/**
 * What a coach does to a system as a whole, rather than to what is on the court.
 *
 * Shown in both modes, unlike the authoring controls: watching a system and editing one are both
 * things you arrive at from here, and a menu that vanished in play mode would take the way back
 * with it. Controlled like the branches menu beside it, for the same reason — picking an entry
 * has to close the dropdown, which an uncontrolled popover has no way to do.
 */
export function PlayMenu() {
  const { t } = useTranslation();
  const { mode, setMode } = useEditorContext();
  const [opened, setOpened] = useState(false);
  // The dialog stays mounted so Mantine's transitions survive, and its `key` changes on each
  // open so its fields reset on a fresh instance rather than through an effect.
  const [creating, setCreating] = useState({ opened: false, count: 0 });

  const pick = (act: () => void) => () => {
    setOpened(false);
    act();
  };

  return (
    <>
      <Popover opened={opened} onChange={setOpened} width={240} position="bottom-start" shadow="md" trapFocus>
        <Popover.Target>
          <ActionIcon
            variant="default"
            size={36}
            onClick={() => setOpened((open) => !open)}
            aria-label={t('play.menu.label', 'System menu')}
          >
            <IconMenu2 size={18} stroke={1.5} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            {/* One entry, never two: the mode you are not in is the only one worth offering, and
              a pair would ask the coach to read which of them is already true. */}
            {mode === 'play' ? (
              <Button
                variant="subtle"
                fullWidth
                justify="flex-start"
                leftSection={<IconPencil size={16} stroke={1.5} />}
                onClick={pick(() => setMode('edit'))}
              >
                {t('play.menu.editMode', 'Edit mode')}
              </Button>
            ) : (
              <Button
                variant="subtle"
                fullWidth
                justify="flex-start"
                leftSection={<IconEye size={16} stroke={1.5} />}
                onClick={pick(() => setMode('play'))}
              >
                {t('play.menu.playMode', 'Play mode')}
              </Button>
            )}
            <Divider />
            <Button
              variant="subtle"
              fullWidth
              justify="flex-start"
              onClick={pick(() => setCreating((c) => ({ opened: true, count: c.count + 1 })))}
            >
              {t('play.menu.create', 'Create a new system')}
            </Button>
            <Tooltip label={t('play.menu.saveSoon', 'Saving arrives with persistence')}>
              {/* Mantine needs the disabled control wrapped for the tooltip to receive events. */}
              <span>
                <Button variant="subtle" fullWidth justify="flex-start" disabled>
                  {t('play.menu.save', 'Save')}
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Popover.Dropdown>
      </Popover>
      <CreatePlayDialog
        key={creating.count}
        opened={creating.opened}
        onClose={() => setCreating((c) => ({ ...c, opened: false }))}
      />
    </>
  );
}
