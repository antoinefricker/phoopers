import { useState } from 'react';
import { Button, Group, Modal, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface Props {
  opened: boolean;
  initialName: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

// Rendered always, with a `key` that changes on every open, so the field starts from the
// system's current name without a state reset inside an effect.
export function RenamePlayDialog({ opened, initialName, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  const submit = () => {
    if (trimmed !== '') onSubmit(trimmed);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('mine.rename.title', 'Rename system')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextInput
          label={t('mine.rename.name', 'Name')}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            {t('play.editor.cancel', 'Cancel')}
          </Button>
          <Button type="submit" disabled={trimmed === ''}>
            {t('mine.rename.confirm', 'Rename')}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
