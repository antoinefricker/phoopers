import { useState } from 'react';
import { Alert, Button, Group, Modal, Radio, Stack, TextInput } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { CourtExtent, Play } from '../engine';
import type { LineupKind } from './lineups';
import { useEditorContext } from './useEditorContext';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Hides the warning about discarding the open system, for callers where none is open. */
  hideDiscardWarning?: boolean;
}

/**
 * Which courts the dialog offers, and what each one means to the model.
 *
 * NBA floors are representable — `Play.court` carries them and the geometry draws them — but a
 * creation form with four courts in it asks a question nobody has yet needed answered.
 */
const COURTS: Record<string, { court: Play['court']; extent: CourtExtent }> = {
  'fiba-full': { court: 'fiba', extent: 'full' },
  'fiba-half': { court: 'fiba', extent: 'half' },
};

/**
 * Everything a coach knows before drawing: what the system is called, which court it is played
 * on, and who is standing on it.
 *
 * It is also the confirmation for discarding whatever is open — opening this and submitting it
 * is a deliberate enough act that a second dialog in front of it would only be in the way.
 */
export function CreatePlayDialog({ opened, onClose, hideDiscardWarning = false }: Props) {
  const { t } = useTranslation();
  const { createPlay } = useEditorContext();
  const [name, setName] = useState('');
  const [courtKey, setCourtKey] = useState('fiba-full');
  const [lineup, setLineup] = useState<LineupKind>('empty');
  const named = name.trim() !== '';

  const submit = () => {
    const choice = COURTS[courtKey] ?? COURTS['fiba-full'];
    if (!named || choice === undefined) return;
    createPlay({ name: name.trim(), court: choice.court, extent: choice.extent, lineup });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('play.create.title', 'New system')}>
      <Stack gap="md">
        <TextInput
          label={t('play.create.name', 'Name')}
          placeholder={t('play.create.namePlaceholder', 'Horns, Flex, 1-4 high…')}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          data-autofocus
          required
        />
        <Radio.Group label={t('play.create.court', 'Court')} value={courtKey} onChange={setCourtKey}>
          <Stack gap="xs" mt="xs">
            <Radio value="fiba-full" label={t('play.create.courtFull', 'FIBA full court')} />
            <Radio value="fiba-half" label={t('play.create.courtHalf', 'FIBA half court')} />
          </Stack>
        </Radio.Group>
        <Radio.Group
          label={t('play.create.lineup', 'Starting placement')}
          value={lineup}
          onChange={(value) => setLineup(value as LineupKind)}
        >
          <Stack gap="xs" mt="xs">
            <Radio value="empty" label={t('play.create.lineupEmpty', 'Empty, ball only')} />
            <Radio value="fiveOnFive" label={t('play.create.lineupFive', '5 on 5')} />
            <Radio value="threeOnThree" label={t('play.create.lineupThree', '3 on 3')} />
          </Stack>
        </Radio.Group>
        {/* The editor always has a system open; the home screen has none, and says so by hiding this. */}
        {!hideDiscardWarning && (
          <Alert color="yellow" icon={<IconAlertTriangle size={18} stroke={1.5} />}>
            {t('play.create.discard', 'The system you have open, and all its variants, will be discarded.')}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('play.create.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={!named}>
            {t('play.create.submit', 'Create')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
