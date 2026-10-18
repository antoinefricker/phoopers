import { Button, Group, Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface Props {
  opened: boolean;
  /** The name of the system whose unsaved changes are about to be left behind. */
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Told before another system replaces the draft: the changes in progress are not kept anywhere
 * else. Callers render it always and change its `key` on each open.
 */
export function LeaveDraftDialog({ opened, name, onConfirm, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal opened={opened} onClose={onClose} title={t('draft.leave.title', 'Leave your unsaved changes?')}>
      <Text size="sm">
        {t('draft.leave.body', 'Opening another system replaces {{name}}, and its unsaved changes will be lost.', {
          name,
        })}
      </Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t('draft.leave.stay', 'Keep editing')}
        </Button>
        <Button color="red" onClick={onConfirm}>
          {t('draft.leave.confirm', 'Open anyway')}
        </Button>
      </Group>
    </Modal>
  );
}
