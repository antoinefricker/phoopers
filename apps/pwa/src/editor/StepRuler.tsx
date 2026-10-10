import { Box, Button, Group, Popover, Text, TextInput } from '@mantine/core';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityId, Step, StepId } from '../engine';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { constrainRetime } from './constraints';
import { LABEL_WIDTH } from './TimelineRow';
import { fractionOf } from './timelineGeometry';
import { useEditorContext } from './useEditorContext';
import { useTimeDrag } from './useTimeDrag';

const SNAP_FRACTION = 0.02;

// `constrainRetime` takes an entity whose track supplies the neighbour bounds. A step has no
// neighbours (steps may share a time, and two at one time is legal at a fork), so it is given an
// id with no track: the only bound left is the floor, the fork time of the branch that owns it.
const NO_TRACK = 'step' as EntityId;

const percent = (t: number, duration: number) => `${fractionOf(t, duration) * 100}%`;

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
      <TextInput
        size="xs"
        label={t('play.editor.stepName', 'Step name')}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
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
      <Box ref={trackRef} style={{ position: 'relative', flex: 1, height: '100%' }}>
        {steps.map((step) => {
          // The branch that owns the step sets its floor, which is not always the one being viewed.
          const owner = play.branches.find((b) => b.steps.some((s) => s.id === step.id));
          const others = steps.filter((s) => s.id !== step.id);

          return (
            <Popover
              key={step.id}
              opened={openId === step.id}
              onChange={(opened) => setOpenId(opened ? step.id : null)}
              position="bottom"
              withArrow
              // The ruler scrolls with the timeline; the editor should stay with the step it edits
              // rather than vanish when floating-ui judges the tick clipped (it always does in jsdom).
              hideDetached={false}
            >
              <Popover.Target>
                <button
                  type="button"
                  onClick={() => {
                    if (!consumeDrag()) setOpenId(openId === step.id ? null : step.id);
                  }}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: percent(step.t, duration),
                    transform: 'translate(-50%, -50%)',
                    padding: '0 4px',
                    cursor: 'grab',
                    touchAction: 'none',
                    whiteSpace: 'nowrap',
                    border: 0,
                    borderLeft: '2px solid var(--mantine-color-blue-filled)',
                    background: 'transparent',
                    color: 'var(--mantine-color-text)',
                  }}
                  {...bind({
                    resolve: (rawT) =>
                      constrainRetime(
                        play,
                        owner?.id ?? branchId,
                        NO_TRACK,
                        step.t,
                        rawT,
                        others,
                        SNAP_FRACTION * duration,
                      ),
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
