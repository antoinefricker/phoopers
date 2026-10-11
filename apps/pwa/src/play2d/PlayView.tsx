import { useId, useState } from 'react';
import { ActionIcon, Flex, Group, Paper, ScrollArea, SegmentedControl, Stack, Title } from '@mantine/core';
import { IconMenu2, IconX } from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { SelectionActions } from '../editor/SelectionActions';
import { IssuePanel } from '../editor/IssuePanel';
import { EditorToolbar } from '../editor/EditorToolbar';
import { Timeline } from '../editor/Timeline';
import { useEditorContext } from '../editor/useEditorContext';
import { BranchTree } from './BranchTree';
import { PlayCanvas } from './PlayCanvas';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlaybackTransport } from './PlaybackTransport';

// Court (centre), transport (beneath) and branch tree (right). The half/full toggle is local
// view state: it picks a viewBox and nothing else, so it never reaches the playback context or
// the play data. Switching FIBA/NBA is deliberately absent; that edits `Play.court` (later work).
export function PlayView() {
  const { t } = useTranslation();
  const { play, mode } = useEditorContext();
  const [halfCourt, setHalfCourt] = useState(false);
  const sidebarId = useId();
  // The branch list starts open where there is room for it beside the court and collapsed on a
  // phone. Once the user touches the toggle their choice wins over the breakpoint.
  const roomForSidebar = useMediaQuery('(min-width: 48em)', true, { getInitialValueInEffect: false });
  const [sidebarChoice, setSidebarChoice] = useState<boolean | null>(null);
  const sidebarOpen = sidebarChoice ?? roomForSidebar;

  return (
    <PlaybackContextProvider key={play.id} play={play}>
      {/* 100dvh as an inline override: a browser without dvh drops it and keeps the 100vh. */}
      <Stack mih="100vh" style={{ minHeight: '100dvh' }} p="md" gap="sm">
        <Group justify="space-between" align="center" gap="sm">
          <Title order={2}>{play.name}</Title>
          <Group gap="sm" wrap="nowrap">
            <EditorToolbar />
            {/* No size override: this control shares a row with the mode toggle and the toolbar
                buttons, which all sit at Mantine's default. */}
            <SegmentedControl
              aria-label={t('play.court.view', 'Court view')}
              value={halfCourt ? 'half' : 'full'}
              onChange={(value) => setHalfCourt(value === 'half')}
              data={[
                { value: 'full', label: t('play.court.full', 'Full court') },
                { value: 'half', label: t('play.court.half', 'Half court') },
              ]}
            />
            {/* An ActionIcon rather than Mantine's Burger: it takes the border, radius and
                background the neighbouring controls get from the theme, and an explicit 36
                matches their height exactly. The cost is Burger's bars-to-cross animation,
                replaced by swapping the icon. */}
            <ActionIcon
              variant="default"
              size={36}
              onClick={() => setSidebarChoice(!sidebarOpen)}
              aria-label={t('play.branches.toggle', 'Toggle branches')}
              aria-expanded={sidebarOpen}
              aria-controls={sidebarOpen ? sidebarId : undefined}
            >
              {sidebarOpen ? <IconX size={18} stroke={1.5} /> : <IconMenu2 size={18} stroke={1.5} />}
            </ActionIcon>
          </Group>
        </Group>
        {/* Beside the court on a wide screen, stacked beneath it on a narrow one. The court panel
            hugs its own height (align flex-start), so spare vertical space falls to the page
            instead of becoming blank bands inside the bordered panel. */}
        <Flex direction={{ base: 'column', sm: 'row' }} align="flex-start" gap="md">
          <Paper flex={1} w="100%" withBorder p="xs" style={{ minWidth: 0 }}>
            <PlayCanvas halfCourt={halfCourt} playName={play.name} />
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
        {mode === 'edit' && <SelectionActions />}
        {/* The scrubber sits above the ruler and the tracks: they share one time axis and one
            playhead crosses all of them, so the control belongs beside what it drives. */}
        <PlaybackTransport />
        {mode === 'edit' && <Timeline />}
        {mode === 'edit' && <IssuePanel />}
      </Stack>
    </PlaybackContextProvider>
  );
}
