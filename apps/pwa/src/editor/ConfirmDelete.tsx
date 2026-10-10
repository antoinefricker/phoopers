import type { ReactNode } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface Props {
  opened: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

// One dialog for every destructive action. Callers render it always and change its `key` on each
// open, so it remounts fresh without a state reset inside an effect and still keeps Mantine's
// exit transition. The body says what will be destroyed; the dialog never only destroys.
export function ConfirmDelete({ opened, title, body, confirmLabel, onConfirm, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      <Text size="sm">{body}</Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t('play.editor.cancel', 'Cancel')}
        </Button>
        <Button color="red" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
