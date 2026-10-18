import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';

interface Props {
  opened: boolean;
  /** The name of the system waiting in the browser. */
  name: string;
  onResume: () => void;
  onStartNew: () => void;
  onClose: () => void;
}

/**
 * Raised by choosing New system while a draft is waiting. Resuming keeps the draft; only
 * starting a new one lets it go, so closing the dialog changes nothing.
 */
export function ResumeDraftDialog({ opened, name, onResume, onStartNew, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal opened={opened} onClose={onClose} title={t('home.resume.title', 'A system is in progress')}>
      <Stack gap="md">
        <Text>
          <Trans
            i18nKey="home.resume.body"
            defaults="You were working on <b>{{name}}</b>. Resume it, or start a new system and discard it?"
            values={{ name }}
            components={{ b: <strong /> }}
          />
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onStartNew}>
            {t('home.resume.startNew', 'Start a new one')}
          </Button>
          <Button onClick={onResume} data-autofocus>
            {t('home.resume.resume', 'Resume')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
