import { Box, Text } from '@mantine/core';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntityId, ScreenEvent } from '../engine';
import { constrainRetime } from './constraints';
import { fractionOf } from './timelineGeometry';
import type { TimelineRowModel } from './timelineGeometry';
import { useTimeDrag } from './useTimeDrag';
import { useEditorContext } from './useEditorContext';
import type { Selection } from './useEditorContext';
import { usePlaybackContext } from '../play2d/usePlaybackContext';

export const LABEL_WIDTH = '4.5rem';

interface Props {
  row: TimelineRowModel;
  duration: number;
  screens: ScreenEvent[];
  selection: Selection;
  onSelectKeyframe: (entityId: EntityId, t: number) => void;
  onKeyframeRetimed: (entityId: EntityId, fromT: number, toT: number) => void;
}

const percent = (t: number, duration: number) => `${fractionOf(t, duration) * 100}%`;

// A screen shorter than this cannot be grabbed, and `setScreenDuration` refuses a non-positive one.
export const MIN_SCREEN_DURATION = 0.1;
// A drop within this fraction of the play's length of a step snaps to it.
const SNAP_FRACTION = 0.02;

export function TimelineRow({ row, duration, screens, selection, onSelectKeyframe, onKeyframeRetimed }: Props) {
  const { t } = useTranslation();
  const { play, moveKeyframe, setScreenDuration } = useEditorContext();
  const { branchId, timeline } = usePlaybackContext();
  const trackRef = useRef<HTMLDivElement>(null);
  const ownTrack = play.branches.find((b) => b.id === branchId)?.tracks[row.entityId] ?? [];
  const { bind, consumeDrag } = useTimeDrag(trackRef, duration);
  const isBall = row.team === 'ball';
  const label = isBall ? t('play.editor.ballRow', 'Ball') : row.label;

  return (
    <Box data-testid={`timeline-row-${row.entityId}`} style={{ display: 'flex', alignItems: 'center', height: '2rem' }}>
      <Text size="sm" w={LABEL_WIDTH} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Box ref={trackRef} style={{ position: 'relative', flex: 1, height: '100%' }}>
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
        {screens.map((screen) => (
          <Box
            key={screen.id}
            data-testid={`screen-bar-${screen.id}`}
            style={{
              position: 'absolute',
              top: '20%',
              height: '60%',
              left: percent(screen.t, duration),
              width: `${(fractionOf(screen.t + screen.duration, duration) - fractionOf(screen.t, duration)) * 100}%`,
              background: 'var(--mantine-color-grape-light)',
              borderRadius: 2,
              pointerEvents: 'none',
            }}
          >
            <div
              data-testid={`screen-handle-${screen.id}`}
              aria-label={t('play.editor.screenDuration', 'Screen duration')}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: -3,
                width: 6,
                cursor: 'ew-resize',
                touchAction: 'none',
                pointerEvents: 'auto',
                background: 'var(--mantine-color-grape-filled)',
              }}
              {...bind({
                // The edge cannot go left of the screen's own start: it floors at a minimum duration.
                resolve: (rawT) => Math.max(rawT, screen.t + MIN_SCREEN_DURATION),
                place: (element, end) => {
                  const bar = element.parentElement;
                  if (bar !== null) {
                    bar.style.width = `${(fractionOf(end, duration) - fractionOf(screen.t, duration)) * 100}%`;
                  }
                },
                restore: (element) => {
                  const bar = element.parentElement;
                  if (bar !== null) {
                    bar.style.width = `${(fractionOf(screen.t + screen.duration, duration) - fractionOf(screen.t, duration)) * 100}%`;
                  }
                },
                commit: (end) => setScreenDuration(screen.id, end - screen.t),
              })}
            />
          </Box>
        ))}
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
          // A child branch's anchors include its ancestors' keyframes and the synthesised one at
          // its fork instant. They are not in this branch's own track, so there is nothing here
          // to retime: the marker is shown but, like the pre-fork part of the court, is locked.
          const owned = ownTrack.some((own) => own.t === k.t);

          return (
            <button
              key={k.t}
              type="button"
              data-kind={hollow ? 'position' : 'attached'}
              aria-pressed={selected}
              aria-label={t('play.editor.keyframeAt', 'Keyframe at {{t}}s', { t: k.t })}
              onClick={() => {
                if (!consumeDrag()) onSelectKeyframe(row.entityId, k.t);
              }}
              data-inherited={owned ? undefined : 'true'}
              {...(owned
                ? bind({
                    resolve: (rawT) =>
                      constrainRetime(
                        play,
                        branchId,
                        row.entityId,
                        k.t,
                        rawT,
                        timeline.steps,
                        SNAP_FRACTION * duration,
                      ),
                    place: (element, value) => {
                      element.style.left = percent(value, duration);
                    },
                    restore: (element) => {
                      element.style.left = percent(k.t, duration);
                    },
                    commit: (value) => {
                      moveKeyframe(branchId, row.entityId, k.t, value);
                      onKeyframeRetimed(row.entityId, k.t, value);
                    },
                  })
                : {})}
              style={{
                position: 'absolute',
                top: '50%',
                left: percent(k.t, duration),
                touchAction: owned ? 'none' : undefined,
                width: 14,
                height: 14,
                padding: 0,
                cursor: owned ? 'grab' : 'pointer',
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
