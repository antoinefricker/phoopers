import { ActionIcon, Box, Button, Group, Popover, TextInput } from '@mantine/core';
import { useRef, useState } from 'react';
import { IconPencil, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { Step, StepId } from '../engine';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { constrainStepRetime } from './constraints';
import { TimelineBar } from './TimelineBar';
import { TimeWindow } from './TimeWindow';
import { LABEL_WIDTH, MIN_SCREEN_DURATION } from './TimelineRow';
import { barResize, barResizeStart, cellPx, leftPx, spanPx } from './timelineGeometry';
import { useEditorContext } from './useEditorContext';
import { useTimeDrag } from './useTimeDrag';
import { useTimelineViewportContext } from './useTimelineViewportContext';
import { snapRadiusSeconds } from './timelineScale';

interface EditorProps {
  step: Step;
  onDone: () => void;
}

// Mounted only while its popover is open, so each open starts from the step's current name.
function StepEditor({ step, onDone }: EditorProps) {
  const { t } = useTranslation();
  const { renameStep, removeStep } = useEditorContext();
  const [name, setName] = useState(step.name);

  return (
    <Group gap="xs" wrap="nowrap" align="flex-end">
      {/* The timeline sets user-select: none so a drag cannot highlight labels. This field is
          the one place inside it holding text the user edits, so it opts back in. */}
      <TextInput
        size="xs"
        label={t('play.editor.stepName', 'Step name')}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        styles={{ input: { userSelect: 'text' } }}
      />
      <Button
        size="xs"
        onClick={() => {
          renameStep(step.id, name);
          onDone();
        }}
      >
        {t('play.editor.save', 'Save')}
      </Button>
      <Button
        size="xs"
        color="red"
        variant="light"
        onClick={() => {
          // The mutation refuses a step a branch forks from; the popover closes either way.
          removeStep(step.id);
          onDone();
        }}
      >
        {t('play.editor.remove', 'Remove')}
      </Button>
    </Group>
  );
}

/**
 * The ruler above the entity rows: one tick per step. A tick opens an editor on click and
 * retimes on drag. Steps are the transport's snap marks, so changing them here changes where the
 * scrubber snaps with no wiring: the timeline is resolved from the same steps.
 */
export function StepRuler() {
  const { t } = useTranslation();
  const { play, moveStep, removeStep, setStepDuration, resizeStepStart } = useEditorContext();
  const { timeline, branchId } = usePlaybackContext();
  const [openId, setOpenId] = useState<StepId | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const { duration, steps } = timeline;
  const ownStepIds = new Set(play.branches.find((b) => b.id === branchId)?.steps.map((s) => s.id));
  const { pxPerCell } = useTimelineViewportContext();
  const { bind } = useTimeDrag(trackRef, duration);
  // Where each step's label stops being shown. Sorted, because "the next step" is a question
  // about time, not about the order the steps were authored in.
  const ordered = [...steps].sort((a, b) => a.t - b.t);
  const windowEnd = (step: Step, index: number): number => {
    const limit = ordered[index + 1]?.t ?? duration;
    if (step.duration === undefined) return limit;

    // A duration that is not a positive number has no window: `validatePlay` reports it, and a
    // NaN here would reach the bar's width and collapse the ruler's layout.
    return Number.isFinite(step.duration) && step.duration > 0 ? Math.min(step.t + step.duration, limit) : step.t;
  };

  return (
    <Box data-testid="step-ruler" style={{ display: 'flex', alignItems: 'center', height: '2rem' }}>
      {/* Empty, and kept: the ruler's label column holds the width the rows' gutters hold, so
          the time axis starts at the same x on both. Adding a step moved to the transport. */}
      <Box w={LABEL_WIDTH} style={{ flexShrink: 0 }} />
      {/* The one window that reports its width: the ruler is rendered exactly once and is the
          same width as every row beside it, while rows come and go as players are added. */}
      <TimeWindow testId="step-ruler-window" contentRef={trackRef} measure>
        <Box data-testid="step-ruler-track" style={{ position: 'relative', width: '100%', height: '100%' }}>
          {ordered.map((step, index) => {
            const others = steps.filter((s) => s.id !== step.id);
            const end = windowEnd(step, index);
            const barWidth = spanPx(step.t, end, pxPerCell);
            // The earliest the start may go. The previous step's window ends where it ends, and
            // two windows may never overlap; a previous step with no duration of its own runs
            // until this one starts, so it is left the minimum a window can have rather than none.
            const before = ordered[index - 1];
            const startFloor =
              before === undefined
                ? 0
                : before.duration === undefined
                  ? before.t + MIN_SCREEN_DURATION
                  : windowEnd(before, index - 1);

            // The app's own colour, through the primary variables rather than a named green: a
            // step is the product's way of annotating a play, not something either team owns, and
            // the bars follow the primary wherever it goes next. The court's blue and red, and the
            // screen blocks that echo the offense, stay named on purpose.
            // An ancestor's step is shown (it is a snap mark) but belongs to that ancestor: moving,
            // renaming or removing it from here would rewrite the base play and every sibling.
            // The same rule keyframes follow in `TimelineRow`.
            if (!ownStepIds.has(step.id)) {
              return (
                <TimelineBar
                  key={step.id}
                  testId={`step-bar-${step.id}`}
                  inherited
                  left={leftPx(step.t, pxPerCell)}
                  width={barWidth}
                  color="primary"
                  caption={step.name}
                  captionDimmed
                />
              );
            }

            return (
              <Popover
                key={step.id}
                opened={openId === step.id}
                onChange={(opened) => setOpenId(opened ? step.id : null)}
                position="bottom"
                withArrow
              >
                <TimelineBar
                  testId={`step-bar-${step.id}`}
                  left={leftPx(step.t, pxPerCell)}
                  width={barWidth}
                  color="primary"
                  label={step.name}
                  // The bar itself retimes the step, as its tick did before it had a width.
                  bar={bind({
                    current: step.t,
                    // The bar starts at the step's time rather than straddling it.
                    anchor: 'start',
                    resolve: (rawT, snap) =>
                      constrainStepRetime(play, step.id, step.t, rawT, others, snap ? snapRadiusSeconds(pxPerCell) : 0),
                    place: (element, value) => {
                      element.style.left = leftPx(value, pxPerCell);
                    },
                    restore: (element) => {
                      element.style.left = leftPx(step.t, pxPerCell);
                    },
                    commit: (value) => moveStep(step.id, value),
                  })}
                  handleWidth={cellPx(pxPerCell)}
                  startHandle={{
                    testId: `step-start-handle-${step.id}`,
                    label: t('play.editor.stepStart', 'Label start'),
                    bind: bind({
                      current: step.t,
                      // The handle sits on the bar's left edge, which is the step's time.
                      anchor: 'start',
                      // The step's own retime bounds first (the fork floor, its ceiling, the step
                      // marks it snaps to), then the window's: no earlier than the previous
                      // window ends, and a minimum duration left before the end that stays put.
                      resolve: (rawT, snap) =>
                        Math.max(
                          startFloor,
                          Math.min(
                            constrainStepRetime(
                              play,
                              step.id,
                              step.t,
                              rawT,
                              others,
                              snap ? snapRadiusSeconds(pxPerCell) : 0,
                            ),
                            end - MIN_SCREEN_DURATION,
                          ),
                        ),
                      ...barResizeStart(end, step.t, pxPerCell),
                      commit: (value) => resizeStepStart(step.id, value, end),
                    }),
                  }}
                  handle={{
                    testId: `step-handle-${step.id}`,
                    label: t('play.editor.stepDuration', 'Label duration'),
                    bind: bind({
                      current: windowEnd(step, index),
                      // The handle sits inside the bar's last cell, and the end it sets is its
                      // right edge, not its middle.
                      anchor: 'end',
                      // Floored at a screen's minimum and capped at the next step, or at the end
                      // of the play for a last step: two windows may never overlap.
                      resolve: (rawT) =>
                        Math.min(Math.max(rawT, step.t + MIN_SCREEN_DURATION), ordered[index + 1]?.t ?? duration),
                      ...barResize(step.t, windowEnd(step, index), pxPerCell),
                      commit: (value) => setStepDuration(step.id, value - step.t),
                    }),
                  }}
                  actions={
                    <>
                      <Popover.Target>
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          aria-label={t('play.editor.editStep', 'Edit {{name}}', { name: step.name })}
                          onClick={() => setOpenId(openId === step.id ? null : step.id)}
                        >
                          <IconPencil size={12} stroke={1.5} />
                        </ActionIcon>
                      </Popover.Target>
                      {/* Both controls wear the bar's own colour, which for a step label bar is
                        the primary — so neither names a colour, the ActionIcon default being
                        the primary already. The remove icon gave up its red for it. */}
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        aria-label={t('play.editor.removeStep', 'Remove {{name}}', { name: step.name })}
                        onClick={() => removeStep(step.id)}
                      >
                        <IconX size={12} stroke={1.5} />
                      </ActionIcon>
                    </>
                  }
                  // Clipped rather than spilling, by the bar: a name on a narrow window near the
                  // end of the ruler would otherwise run past the track and grow a horizontal
                  // scrollbar. The room it leaves the two controls used to be a hardcoded 36px.
                  caption={step.name}
                />
                <Popover.Dropdown>
                  <StepEditor step={step} onDone={() => setOpenId(null)} />
                </Popover.Dropdown>
              </Popover>
            );
          })}
        </Box>
      </TimeWindow>
    </Box>
  );
}
