import { useState } from 'react';
import { ActionIcon, Button, Popover, Stack, Tooltip } from '@mantine/core';
import { IconDotsVertical } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { CreatePlayDialog } from './CreatePlayDialog';

/**
 * What a coach does to a system as a whole, rather than to what is on the court.
 *
 * Controlled like the branches menu in the header, for the same reason: picking an entry has to
 * close the dropdown, which an uncontrolled popover has no way to do. "Save" is here and
 * disabled rather than absent, so the menu does not change shape when persistence fills it in.
 */
export function PlayMenu() {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  // The dialog stays mounted so Mantine's transitions survive, and its `key` changes on each
  // open so its fields reset on a fresh instance rather than through an effect.
  const [creating, setCreating] = useState({ opened: false, count: 0 });

  return (
    <>
      <Popover opened={opened} onChange={setOpened} width={240} position="bottom-end" shadow="md" trapFocus>
        <Popover.Target>
          <ActionIcon
            variant="default"
            size={36}
            onClick={() => setOpened((open) => !open)}
            aria-label={t('play.menu.label', 'System menu')}
          >
            <IconDotsVertical size={18} stroke={1.5} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Button
              variant="subtle"
              fullWidth
              justify="flex-start"
              onClick={() => {
                setOpened(false);
                setCreating((c) => ({ opened: true, count: c.count + 1 }));
              }}
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
