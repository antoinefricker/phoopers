import { useState } from 'react';
import { ActionIcon, Group, Paper, Popover, ScrollArea, SegmentedControl, Stack, Title } from '@mantine/core';
import { IconGitBranch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SelectionActions } from '../editor/SelectionActions';
import { IssuePanel } from '../editor/IssuePanel';
import { EditorToolbar } from '../editor/EditorToolbar';
import { Timeline } from '../editor/Timeline';
import { useEditorContext } from '../editor/useEditorContext';
import { BranchTree } from './BranchTree';
import { PlayCanvas } from './PlayCanvas';
import { FLOOR } from './Court';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlaybackTransport } from './PlaybackTransport';

// Court (centre), transport (beneath) and the branch menu in the header. The half/full toggle is local
// view state: it picks a viewBox and nothing else, so it never reaches the playback context or
// the play data. Switching FIBA/NBA is deliberately absent; that edits `Play.court` (later work).
export function PlayView() {
  const { t } = useTranslation();
  const { play, mode } = useEditorContext();
  const [halfCourt, setHalfCourt] = useState(false);
  // Controlled rather than left to Mantine: picking a variant closes the menu, which the
  // uncontrolled popover has no way to do.
  const [branchesOpen, setBranchesOpen] = useState(false);

  return (
    <PlaybackContextProvider key={play.id} play={play}>
      {/* 100dvh as an inline override: a browser without dvh drops it and keeps the 100vh. */}
      <Stack mih="100vh" style={{ minHeight: '100dvh' }} p="md" gap="sm">
        <Group justify="space-between" align="center" gap="sm">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            {/* The variants live in a menu ahead of the title rather than in a panel beside the
                court, so the court keeps the full width at every screen size. The trigger is
                icon-only: Popover gives it `aria-expanded`, and the dropdown repeats the name
                as its heading. */}
            <Popover
              opened={branchesOpen}
              onChange={setBranchesOpen}
              width={300}
              position="bottom-start"
              shadow="md"
              trapFocus
              // Below Mantine's Modal, which sits at 200. The fork and delete dialogs are
              // rendered by the tree INSIDE this dropdown, and at Popover's default 300 the
              // menu drew itself over their overlay and clipped the dialog. The menu stays
              // open behind the dialog on purpose: closing it would unmount the dialog with it.
              zIndex={190}
            >
              <Popover.Target>
                <ActionIcon
                  variant="default"
                  size={36}
                  onClick={() => setBranchesOpen((open) => !open)}
                  aria-label={t('play.branches.title', 'Branches')}
                >
                  <IconGitBranch size={18} stroke={1.5} />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Title order={6} mb="xs">
                  {t('play.branches.title', 'Branches')}
                </Title>
                <ScrollArea.Autosize mah="min(60vh, 24rem)">
                  <BranchTree play={play} onBranchSelected={() => setBranchesOpen(false)} />
                </ScrollArea.Autosize>
              </Popover.Dropdown>
            </Popover>
            <Title order={2}>{play.name}</Title>
          </Group>
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
          </Group>
        </Group>
        {/* No padding, and the floor's colour behind the drawing: the court keeps its own
            aspect ratio, so a panel wider or taller than it leaves a band the svg does not
            cover — white there read as a gap in the floor. */}
        <Paper withBorder p={0} bg={FLOOR} style={{ minWidth: 0 }}>
          <PlayCanvas halfCourt={halfCourt} playName={play.name} />
        </Paper>
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
