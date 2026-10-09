import { useState } from 'react';
import { Group, Paper, SegmentedControl, Stack, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Play } from '../engine';
import { BranchTree } from './BranchTree';
import { PlayCanvas } from './PlayCanvas';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlaybackTransport } from './PlaybackTransport';

interface Props {
  play: Play;
}

// Court (centre), transport (beneath) and branch tree (right). The half/full toggle is local
// view state: it picks a viewBox and nothing else, so it never reaches the playback context or
// the play data. Switching FIBA/NBA is deliberately absent; that edits `Play.court` (later work).
export function PlayView({ play }: Props) {
  const { t } = useTranslation();
  const [halfCourt, setHalfCourt] = useState(false);

  return (
    <PlaybackContextProvider play={play}>
      <Stack h="100vh" p="md" gap="sm">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Title order={2}>{play.name}</Title>
          <SegmentedControl
            value={halfCourt ? 'half' : 'full'}
            onChange={(value) => setHalfCourt(value === 'half')}
            data={[
              { value: 'full', label: t('play.court.full', 'Full court') },
              { value: 'half', label: t('play.court.half', 'Half court') },
            ]}
          />
        </Group>
        <Group align="stretch" flex={1} mih={0} wrap="nowrap" gap="md">
          <Paper flex={1} mih={0} withBorder p="xs">
            <PlayCanvas halfCourt={halfCourt} />
          </Paper>
          <Paper w={220} withBorder p="xs">
            <Title order={6} mb="xs">
              {t('play.branches.title', 'Branches')}
            </Title>
            <BranchTree play={play} />
          </Paper>
        </Group>
        <PlaybackTransport />
      </Stack>
    </PlaybackContextProvider>
  );
}
