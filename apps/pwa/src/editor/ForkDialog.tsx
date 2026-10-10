import { useState } from 'react';
import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { BranchId } from '../engine';
import { resolveBranch } from '../engine';
import { usePlaybackContext } from '../play2d/usePlaybackContext';
import { useEditorContext } from './useEditorContext';

interface Props {
  parentBranchId: BranchId;
  onClose: () => void;
}

// Mounted fresh on every open (the parent renders it conditionally), so the fields start empty
// without a state reset inside an effect.
export function ForkDialog({ parentBranchId, onClose }: Props) {
  const { t } = useTranslation();
  const { play, forkBranch } = useEditorContext();
  const { selectBranch, seek } = usePlaybackContext();
  // The steps visible on the parent, inherited ones included: the timeline resolves the chain.
  const steps = resolveBranch(play, parentBranchId).steps;
  const [stepId, setStepId] = useState<string | null>(steps[0]?.id ?? null);
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const canCreate = stepId !== null && trimmed !== '';

  const create = () => {
    const step = steps.find((s) => s.id === stepId);
    if (step === undefined || trimmed === '') return;

    const created = forkBranch(parentBranchId, step.id, trimmed);
    if (created !== null) {
      // The coach lands in what they just made, at the start of its replayed opening.
      selectBranch(created);
      seek(0);
    }
    onClose();
  };

  return (
    <Modal opened onClose={onClose} title={t('play.editor.forkTitle', 'Create a variant')}>
      <Stack gap="sm">
        {steps.length === 0 && (
          <Text size="sm">
            {t('play.editor.forkNoSteps', 'This branch has no step to fork from. Add a step on the timeline first.')}
          </Text>
        )}
        <Select
          label={t('play.editor.forkStep', 'Fork from step')}
          data={steps.map((s) => ({ value: s.id, label: s.name }))}
          value={stepId}
          onChange={setStepId}
          allowDeselect={false}
          disabled={steps.length === 0}
        />
        <TextInput
          label={t('play.editor.variantName', 'Variant name')}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            {t('play.editor.forkCancel', 'Cancel')}
          </Button>
          <Button onClick={create} disabled={!canCreate}>
            {t('play.editor.forkCreate', 'Create')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
