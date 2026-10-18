import { useState } from 'react';
import { Alert, Button, Group, Modal, Radio, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

/** What the dialog is for: a first save, a copy of someone else's system, or storing one again. */
export type SaveKind = 'first' | 'copy' | 'restore';

interface Props {
  opened: boolean;
  kind: SaveKind;
  initialName: string;
  initialPublic: boolean;
  /** Who owns the system being copied; absent until it is known. */
  authorName?: string;
  pending: boolean;
  failed: boolean;
  onSubmit: (choice: { name: string; isPublic: boolean }) => void;
  onClose: () => void;
}

/**
 * The twin of the creation dialog: a name and who can see the system. A copy is always private,
 * so its visibility is shown but cannot be changed. Rendered always, with a `key` that changes on
 * every open, so its fields start afresh without a state reset inside an effect.
 */
export function SavePlayDialog({
  opened,
  kind,
  initialName,
  initialPublic,
  authorName,
  pending,
  failed,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState(initialPublic ? 'public' : 'private');
  const anotherCoach = t('play.save.anotherCoach', 'another coach');
  const copy = kind === 'copy';
  const named = name.trim() !== '';

  const submit = () => {
    if (!named || pending) return;
    onSubmit({ name: name.trim(), isPublic: !copy && visibility === 'public' });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={copy ? t('play.save.copyTitle', 'Save a copy') : t('play.save.title', 'Save the system')}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap="md">
          {copy && (
            <Text size="sm">
              {t(
                'play.save.copyNotice',
                'This system belongs to {{author}}. Saving it will make a copy that is yours.',
                {
                  author: authorName ?? anotherCoach,
                },
              )}
            </Text>
          )}
          {kind === 'restore' && (
            <Text size="sm">
              {t(
                'play.save.restoreNotice',
                'This system no longer exists in your account. Saving will store it again.',
              )}
            </Text>
          )}
          <TextInput
            label={t('play.save.name', 'Name')}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            data-autofocus
            required
          />
          <Radio.Group
            label={t('play.save.visibility', 'Who can see it')}
            value={copy ? 'private' : visibility}
            onChange={setVisibility}
          >
            <Stack gap="xs" mt="xs">
              <Radio value="private" label={t('play.save.private', 'Private: only you can see it')} />
              <Radio
                value="public"
                disabled={copy}
                label={t('play.save.public', 'Public: visible to everyone in the library')}
              />
            </Stack>
          </Radio.Group>
          {failed && (
            <Alert color="red">
              {t('play.save.error', 'The system could not be saved. Your work is kept here; try again.')}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('play.save.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!named} loading={pending}>
              {t('play.save.submit', 'Save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
