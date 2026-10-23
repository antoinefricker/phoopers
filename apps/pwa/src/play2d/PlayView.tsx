import { useState } from 'react';
import { ActionIcon, Box, Paper, Popover, ScrollArea, Stack, Title } from '@mantine/core';
import { IconGitBranch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '../app/AppHeader';
import { SelectionActions } from '../editor/SelectionActions';
import { IssuePanel } from '../editor/IssuePanel';
import { PlayMenu } from '../editor/PlayMenu';
import { TimeGrid } from '../editor/TimeGrid';
import { Timeline } from '../editor/Timeline';
import { TimelineZoomControls } from '../editor/TimelineZoomControls';
import { TimelineViewportContextProvider } from '../editor/TimelineViewportContextProvider';
import { extentOf } from '../engine';
import { useEditorContext } from '../editor/useEditorContext';
import { useModeShortcut } from '../editor/useModeShortcut';
import { BranchTree } from './BranchTree';
import { PlayCanvas } from './PlayCanvas';
import { StepCaption } from './StepCaption';
import { FLOOR } from './Court';
import { HiddenEntitiesContextProvider } from './HiddenEntitiesContextProvider';
import { PlaybackContextProvider } from './PlaybackContextProvider';
import { PlaybackTransport } from './PlaybackTransport';
import { usePlaybackContext } from './usePlaybackContext';
import { GUTTER_WIDTH } from './transportMath';

// Court (centre), transport (beneath) and the branch menu in the header. Which court is drawn is
// the play's own business — `court` and `extent` — so there is no view control for it: one that
// disagreed with the system would draw a half-court set on a full floor.
export function PlayView() {
  const { t } = useTranslation();
  const { play, mode } = useEditorContext();
  // The only caller: the shortcut exists where the mode does, rather than app-wide.
  useModeShortcut();
  // Controlled rather than left to Mantine: picking a variant closes the menu, which the
  // uncontrolled popover has no way to do.
  const [branchesOpen, setBranchesOpen] = useState(false);
  // A system with one variant has nothing to switch to, so while watching, the control is left
  // out rather than shown dead: a system that never forks would otherwise carry a button that
  // does nothing for its whole life. Authoring is the exception rather than a second condition —
  // forking is how a second variant comes to exist, and it is reached from inside this menu.
  const showBranches = mode === 'edit' || play.branches.length > 1;

  return (
    <PlaybackContextProvider key={play.id} play={play}>
      {/* Above both the court and the timeline: one writes what is hidden, the other reads it. */}
      <HiddenEntitiesContextProvider>
        {/* A column of three regions filling the window: a header that neither grows nor
            shrinks, the court at a fixed share of the height, and the time controls taking what
            is left. `height` rather than `min-height`, or the regions have no total to divide.
            100dvh as an inline override: a browser without dvh drops it and keeps the 100vh. */}
        <Stack h="100vh" style={{ height: '100dvh' }} p="md" gap="sm">
          {/* The shared header, so the language and the account are the same here as anywhere
              else — the account control is what this page lacked while it drew its own. The
              padding is 0: the column around it is already padded. */}
          <AppHeader
            p={0}
            // The menu and the wordmark take the timeline's gutter, so the header's left block
            // is the same column as the row names and the transport's buttons beneath it,
            // rather than a width of its own that lands near them and misses.
            leadingWidth={GUTTER_WIDTH}
            // First in the header, ahead of the wordmark and the variants: what it does is to the
            // system as a whole — switch between watching and authoring it, create another one,
            // save this one — rather than to anything inside it. On a phone it also carries the
            // system's name, which the header itself has no room for.
            leading={<PlayMenu />}
            title={play.name}
            // The variants live in a menu ahead of the title rather than in a panel beside the
            // court, so the court keeps the full width at every screen size. The trigger is
            // icon-only: Popover gives it `aria-expanded`, and the dropdown repeats the name
            // as its heading.
            controls={
              showBranches ? (
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
                      variant="light"
                      // Grey for the reason the system menu's is: picking a branch is not an
                      // action on the play, and the primary is spent on the ones that are.
                      color="gray"
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
              ) : undefined
            }
          />
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
            <TimeRegion mode={mode} />
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
            <PlayCanvas extent={extentOf(play)} playName={play.name} />
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

// Inside the playback provider, since the viewport's width follows the resolved timeline's
// duration. Mounted in both modes: the transport sits in it either way. The zoom level resets
// whenever this mounts, which is what keeps it to one editor session.
function TimeRegion({ mode }: { mode: 'play' | 'edit' }) {
  const { timeline } = usePlaybackContext();

  return (
    <TimelineViewportContextProvider duration={timeline.duration}>
      {/* A row of its own, outside the box the grid fills: the grid's lines are measured from the
          transport's top, so a row inside it would have them running behind the buttons. */}
      {mode === 'edit' && <TimelineZoomControls />}
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
    </TimelineViewportContextProvider>
  );
}
