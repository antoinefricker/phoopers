import { useId, useState } from 'react';
import { Burger, Flex, Group, Paper, ScrollArea, SegmentedControl, Stack, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
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
  const sidebarId = useId();
  // The branch list starts open where there is room for it beside the court and collapsed on a
  // phone. Once the user touches the toggle their choice wins over the breakpoint.
  const roomForSidebar = useMediaQuery('(min-width: 48em)', true, { getInitialValueInEffect: false });
  const [sidebarChoice, setSidebarChoice] = useState<boolean | null>(null);
  const sidebarOpen = sidebarChoice ?? roomForSidebar;

  return (
    <PlaybackContextProvider play={play}>
      {/* 100dvh as an inline override: a browser without dvh drops it and keeps the 100vh. */}
      <Stack mih="100vh" style={{ minHeight: '100dvh' }} p="md" gap="sm">
        <Group justify="space-between" align="center" gap="sm">
          <Title order={2}>{play.name}</Title>
          <Group gap="sm" wrap="nowrap">
            <SegmentedControl
              size="xs"
              value={halfCourt ? 'half' : 'full'}
              onChange={(value) => setHalfCourt(value === 'half')}
              data={[
                { value: 'full', label: t('play.court.full', 'Full court') },
                { value: 'half', label: t('play.court.half', 'Half court') },
              ]}
            />
            <Burger
              opened={sidebarOpen}
              onClick={() => setSidebarChoice(!sidebarOpen)}
              size="sm"
              aria-label={t('play.branches.toggle', 'Toggle branches')}
              aria-expanded={sidebarOpen}
              aria-controls={sidebarOpen ? sidebarId : undefined}
            />
          </Group>
        </Group>
        {/* Beside the court on a wide screen, stacked beneath it on a narrow one. The court panel
            hugs its own height (align flex-start), so spare vertical space falls to the page
            instead of becoming blank bands inside the bordered panel. */}
        <Flex direction={{ base: 'column', sm: 'row' }} align="flex-start" gap="md">
          <Paper flex={1} w="100%" withBorder p="xs" style={{ minWidth: 0 }}>
            <PlayCanvas halfCourt={halfCourt} />
          </Paper>
          {sidebarOpen && (
            <Paper id={sidebarId} w={{ base: '100%', sm: 220 }} withBorder p="xs" style={{ flexShrink: 0 }}>
              <Title order={6} mb="xs">
                {t('play.branches.title', 'Branches')}
              </Title>
              <ScrollArea.Autosize mah="min(60vh, 24rem)">
                <BranchTree play={play} />
              </ScrollArea.Autosize>
            </Paper>
          )}
        </Flex>
        <PlaybackTransport />
      </Stack>
    </PlaybackContextProvider>
  );
}
