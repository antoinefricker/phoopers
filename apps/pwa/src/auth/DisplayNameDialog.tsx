import { useState } from 'react';
import { Alert, Button, Group, Modal, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useSaveDisplayName } from './useProfile';

interface Props {
  opened: boolean;
  initialName?: string;
  /** Called once the name is saved. */
  onDone?: () => void;
  /** Present when the coach may leave without naming themselves; absent on the first return. */
  onClose?: () => void;
}

// Rendered always, with a `key` that changes on every open, so the field starts from the
// current name without a state reset inside an effect. Without `onClose` there is no way out:
// a coach with no name has no profile row, and nothing they draw could be saved.
export function DisplayNameDialog({ opened, initialName = '', onDone, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const save = useSaveDisplayName();
  const trimmed = name.trim();
  const closable = onClose !== undefined;

  const submit = () => {
    if (trimmed === '' || save.isPending) return;
    save.mutate(trimmed, { onSuccess: () => onDone?.() });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose ?? (() => undefined)}
      withCloseButton={closable}
      closeOnEscape={closable}
      closeOnClickOutside={closable}
      title={t('auth.displayName.title', 'What should we call you?')}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Text size="sm" c="dimmed" mb="sm">
          {t('auth.displayName.hint', 'This is the name shown on public systems. You can change it later.')}
        </Text>
        <TextInput
          label={t('auth.displayName.label', 'Display name')}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          data-autofocus
        />
        {save.isError && (
          <Alert color="red" mt="sm">
            {t('auth.displayName.error', 'The name could not be saved. Try again.')}
          </Alert>
        )}
        <Group justify="flex-end" mt="md">
          <Button type="submit" disabled={trimmed === ''} loading={save.isPending}>
            {t('auth.displayName.confirm', 'Continue')}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
