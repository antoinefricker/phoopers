import { Box, Button, Group, Popover, Text, TextInput } from '@mantine/core';
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { Step, StepId } from '../engine';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { constrainStepRetime } from './constraints';
import { LABEL_WIDTH } from './TimelineRow';
import { TRACK_INSET_PX, fractionOf } from './timelineGeometry';
import { TIME_READOUT_PX } from '../play2d/transportMath';
import { useEditorContext } from './useEditorContext';
import { useTimeDrag } from './useTimeDrag';

const SNAP_FRACTION = 0.02;

const percent = (t: number, duration: number) => `${fractionOf(t, duration) * 100}%`;

const tickStyle = (t: number, duration: number): CSSProperties => ({
  position: 'absolute',
  top: '50%',
  left: percent(t, duration),
  // Vertical centring only. The tick's visible marker is its LEFT BORDER, so translating it
  // horizontally by half its own width put the line half a label-width before the step's real
  // time — 60px out for "Double high screen", 35px for "Entry pass". The name now hangs to the
  // right of a line that sits exactly on the instant, matching the scrubber and the markers.
  transform: 'translateY(-50%)',
  padding: '0 4px',
  whiteSpace: 'nowrap',
  border: 0,
  borderLeft: '2px solid var(--mantine-color-blue-filled)',
  background: 'transparent',
  color: 'var(--mantine-color-text)',
});

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
  const { play, addStep, moveStep } = useEditorContext();
  const { timeline, branchId, currentTimeRef } = usePlaybackContext();
  const [openId, setOpenId] = useState<StepId | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const { duration, steps } = timeline;
  const ownStepIds = new Set(play.branches.find((b) => b.id === branchId)?.steps.map((s) => s.id));
  const { bind, consumeDrag } = useTimeDrag(trackRef, duration);

  return (
    <Box data-testid="step-ruler" style={{ display: 'flex', alignItems: 'center', height: '2rem' }}>
      <Box w={LABEL_WIDTH} style={{ flexShrink: 0 }}>
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() =>
            addStep(
              branchId,
              currentTimeRef.current,
              t('play.editor.stepDefault', 'Step {{n}}', { n: steps.length + 1 }),
            )
          }
        >
          {t('play.editor.addStep', 'Add step')}
        </Button>
      </Box>
      {/* Same inset as TimelineRow's track, so the ruler's time axis lines up with the rows. */}
      <Box
        ref={trackRef}
        data-testid="step-ruler-track"
        style={{
          position: 'relative',
          flex: 1,
          height: '100%',
          marginLeft: TRACK_INSET_PX,
          marginRight: TRACK_INSET_PX + TIME_READOUT_PX,
        }}
      >
        {steps.map((step) => {
          const others = steps.filter((s) => s.id !== step.id);

          // An ancestor's step is shown (it is a snap mark) but belongs to that ancestor: moving,
          // renaming or removing it from here would rewrite the base play and every sibling.
          // The same rule keyframes follow in `TimelineRow`.
          if (!ownStepIds.has(step.id)) {
            return (
              <Text
                key={step.id}
                size="xs"
                component="span"
                data-inherited="true"
                style={{ ...tickStyle(step.t, duration), cursor: 'default', opacity: 0.6 }}
              >
                {step.name}
              </Text>
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
              <Popover.Target>
                <button
                  type="button"
                  onClick={() => {
                    if (!consumeDrag()) setOpenId(openId === step.id ? null : step.id);
                  }}
                  style={{ ...tickStyle(step.t, duration), cursor: 'grab', touchAction: 'none' }}
                  {...bind({
                    current: step.t,
                    resolve: (rawT, snap) =>
                      constrainStepRetime(play, step.id, step.t, rawT, others, snap ? SNAP_FRACTION * duration : 0),
                    place: (element, value) => {
                      element.style.left = percent(value, duration);
                    },
                    restore: (element) => {
                      element.style.left = percent(step.t, duration);
                    },
                    commit: (value) => moveStep(step.id, value),
                  })}
                >
                  <Text size="xs" component="span">
                    {step.name}
                  </Text>
                </button>
              </Popover.Target>
              <Popover.Dropdown>
                <StepEditor step={step} onDone={() => setOpenId(null)} />
              </Popover.Dropdown>
            </Popover>
          );
        })}
      </Box>
    </Box>
  );
}
