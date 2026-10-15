import { Button, Group, Modal, TextInput } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  opened: boolean;
  /** The name the coach gave, empty when they have not named this player yet. */
  current: string;
  /** What the row shows when there is no name: offered as the field's placeholder. */
  fallback: string;
  onRename: (label: string) => void;
  onClose: () => void;
}

/**
 * Renames one player. Callers render it always and change its `key` on each open, so the field
 * starts from the player's current name every time without a `useEffect` writing state — the
 * pattern `ConfirmDelete` uses, for the same reason, and Mantine's exit transition survives it.
 *
 * Clearing the field is how a coach takes a name back: the mutation drops the property and the
 * row returns to the side and the number, which is why the placeholder shows exactly that.
 */
export function RenamePlayer({ opened, current, fallback, onRename, onClose }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(current);

  const submit = () => {
    onRename(name);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('play.editor.renamePlayerTitle', 'Name this player')}>
      <TextInput
        data-autofocus
        label={t('play.editor.playerName', 'Name')}
        description={t('play.editor.playerNameHint', 'Leave it empty to go back to the side and the number.')}
        placeholder={fallback}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        // Enter saves, as it would in any one-field form; the timeline sets user-select: none
        // to stop a marker drag highlighting text, so the field opts back in for its own.
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
        styles={{ input: { userSelect: 'text' } }}
      />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t('play.editor.cancel', 'Cancel')}
        </Button>
        <Button onClick={submit}>{t('play.editor.save', 'Save')}</Button>
      </Group>
    </Modal>
  );
}
