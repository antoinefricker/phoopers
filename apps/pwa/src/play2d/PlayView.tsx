import { useState } from 'react';
import { ActionIcon, Box, Group, Paper, Popover, ScrollArea, SegmentedControl, Stack, Title } from '@mantine/core';
import { IconGitBranch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher';
import { SelectionActions } from '../editor/SelectionActions';
import { IssuePanel } from '../editor/IssuePanel';
import { EditorToolbar } from '../editor/EditorToolbar';
import { TimeGrid } from '../editor/TimeGrid';
import { Timeline } from '../editor/Timeline';
import { useEditorContext } from '../editor/useEditorContext';
import { BranchTree } from './BranchTree';
import { PlayCanvas } from './PlayCanvas';
import { StepCaption } from './StepCaption';
import { FLOOR } from './Court';
import { HiddenEntitiesContextProvider } from './HiddenEntitiesContextProvider';
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
      {/* Above both the court and the timeline: one writes what is hidden, the other reads it. */}
      <HiddenEntitiesContextProvider>
        {/* A column of three regions filling the window: a header that neither grows nor
            shrinks, the court at a fixed share of the height, and the time controls taking what
            is left. `height` rather than `min-height`, or the regions have no total to divide.
            100dvh as an inline override: a browser without dvh drops it and keeps the 100vh. */}
        <Stack h="100vh" style={{ height: '100dvh' }} p="md" gap="sm">
          <Group justify="space-between" align="center" gap="sm" style={{ flex: '0 0 auto' }}>
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
              {/* After the court view, at the far end of the header's controls: it is set once
                  and left alone, unlike its neighbours. */}
              <LanguageSwitcher />
            </Group>
          </Group>
          {/* The time controls sit above the court, between it and the header. The scrubber stays
            directly above the ruler and the tracks: they share one time axis and one playhead
            crosses all of them, so the control belongs beside what it drives.
            This region takes what the header and the court leave. `minHeight: 0` so the tracks'
            own ScrollArea takes over rather than the region refusing to shrink, which is what a
            flex column does by default. */}
          <Box
            style={{
              // Only in edit mode does this region hold anything that needs room. Playing, it is
              // the transport and nothing else, so it takes its own height: it used to keep the
              // floor below either way, which reserved 92px — measured — for a timeline that is
              // not rendered.
              flex: mode === 'edit' ? '1 1 auto' : '0 0 auto',
              // Enough for the transport, the ruler and two rows. Without a floor this region
              // is squeezed to nothing on a short window and the page still does not scroll,
              // which leaves the controls present but unusable. With it, a window too short
              // for the court's 400px and this scrolls the page instead.
              minHeight: mode === 'edit' ? 120 : undefined,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--mantine-spacing-sm)',
            }}
          >
            {/* The scrubber, the step ruler and the keyframe tracks share one time axis, so the
                grid behind them is drawn once here rather than once per surface. Relative, and
                holding only those two: `SelectionActions` and the issue panel below carry no
                time axis, and a grid running behind them would be noise.
                `minHeight: 0` so the timeline's own scroll area takes the squeeze, which is what
                this wrapper would otherwise refuse to pass on. */}
            <Box style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {mode === 'edit' && <TimeGrid />}
              {/* Above the grid, and carrying the gap the region used to give these two. */}
              <Box
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--mantine-spacing-sm)',
                  minHeight: 0,
                }}
              >
                <PlaybackTransport />
                {mode === 'edit' && <Timeline />}
              </Box>
            </Box>
            {mode === 'edit' && <SelectionActions />}
            {mode === 'edit' && <IssuePanel />}
          </Box>
          {/* No padding, and the floor's colour behind the drawing: the court keeps its own
            aspect ratio, so a panel wider or taller than it leaves a band the svg does not
            cover — white there read as a gap in the floor. */}
          {/* Relative so the step caption can pin itself to the court's own top-left corner. */}
          <Paper
            withBorder
            p={0}
            bg={FLOOR}
            // Three fifths of the window, and never under 400px: below that a court stops being
            // a diagram a coach can read. Where that floor and the bars together outgrow a short
            // window, the page scrolls rather than the court giving it up.
            style={{ minWidth: 0, position: 'relative', flex: '0 0 60%', minHeight: 400 }}
          >
            <PlayCanvas halfCourt={halfCourt} playName={play.name} />
            {/* Outside the svg on purpose: the court carries `role="img"`, whose descendants are
              presentational, so a caption drawn inside it would be invisible to assistive
              technology. Out here it is read, and it keeps its size when the half-court toggle
              rescales the viewBox. */}
            <StepCaption />
          </Paper>
        </Stack>
      </HiddenEntitiesContextProvider>
    </PlaybackContextProvider>
  );
}
