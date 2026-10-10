import { Box, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { EntityId } from '../engine';
import { fractionOf } from './timelineGeometry';
import type { TimelineRowModel } from './timelineGeometry';
import type { Selection } from './useEditorContext';

export const LABEL_WIDTH = '4.5rem';

interface Props {
  row: TimelineRowModel;
  duration: number;
  selection: Selection;
  onSelectKeyframe: (entityId: EntityId, t: number) => void;
}

const percent = (t: number, duration: number) => `${fractionOf(t, duration) * 100}%`;

export function TimelineRow({ row, duration, selection, onSelectKeyframe }: Props) {
  const { t } = useTranslation();
  const isBall = row.team === 'ball';
  const label = isBall ? t('play.editor.ballRow', 'Ball') : row.label;

  return (
    <Box data-testid={`timeline-row-${row.entityId}`} style={{ display: 'flex', alignItems: 'center', height: '2rem' }}>
      <Text size="sm" w={LABEL_WIDTH} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Box style={{ position: 'relative', flex: 1, height: '100%' }}>
        <Box
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 1,
            background: 'var(--mantine-color-default-border)',
          }}
        />
        {isBall &&
          row.keyframes.map((k, index) => {
            const next = row.keyframes[index + 1];
            if (next === undefined || k.attachedTo === undefined || next.attachedTo === undefined) return null;

            return (
              <Box
                key={`${k.t}-possession`}
                data-testid={`possession-${k.t}`}
                style={{
                  position: 'absolute',
                  top: '25%',
                  height: '50%',
                  left: percent(k.t, duration),
                  width: `${(fractionOf(next.t, duration) - fractionOf(k.t, duration)) * 100}%`,
                  background: 'var(--mantine-color-orange-light)',
                }}
              />
            );
          })}
        {row.keyframes.map((k) => {
          const selected = selection?.kind === 'keyframe' && selection.entityId === row.entityId && selection.t === k.t;
          const hollow = isBall && k.attachedTo === undefined;

          return (
            <button
              key={k.t}
              type="button"
              data-kind={hollow ? 'position' : 'attached'}
              aria-pressed={selected}
              aria-label={t('play.editor.keyframeAt', 'Keyframe at {{t}}s', { t: k.t })}
              onClick={() => onSelectKeyframe(row.entityId, k.t)}
              style={{
                position: 'absolute',
                top: '50%',
                left: percent(k.t, duration),
                width: 14,
                height: 14,
                padding: 0,
                cursor: 'pointer',
                transform: 'translate(-50%, -50%) rotate(45deg)',
                border: `2px solid var(--mantine-color-${selected ? 'blue-filled' : 'text'})`,
                background: hollow ? 'transparent' : 'var(--mantine-color-text)',
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}
