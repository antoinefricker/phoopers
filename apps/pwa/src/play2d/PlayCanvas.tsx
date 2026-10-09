import { useTranslation } from 'react-i18next';
import { usePlaybackContext } from './usePlaybackContext';
import { Court } from './Court';
import { PathLayer } from './PathLayer';
import { TokenLayer } from './TokenLayer';
import { fullCourtViewBox, halfCourtViewBox } from './geometry/court';
import { attackingSide } from './geometry/attackingSide';

interface Props {
  halfCourt: boolean;
  /** The play's own name: data, so it is interpolated into the label, never translated. */
  playName: string;
}

export function PlayCanvas({ halfCourt, playName }: Props) {
  const { t } = useTranslation();
  const { timeline } = usePlaybackContext();
  const court = timeline.court;

  return (
    <svg
      role="img"
      aria-label={t('play.canvas.label', 'Court diagram: {{name}}', { name: playName })}
      viewBox={halfCourt ? halfCourtViewBox(court, attackingSide(timeline)) : fullCourtViewBox(court)}
      // block: an inline svg sits on the text baseline and leaves a descender gap below it.
      // The max-height keeps the near-square half court from outgrowing the screen.
      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 'calc(100dvh - 12rem)' }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth={4}
          markerHeight={4}
          refX={3}
          refY={2}
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 4 2 L 0 4 z" fill="context-stroke" />
        </marker>
      </defs>
      <Court court={court} />
      <PathLayer />
      <TokenLayer />
    </svg>
  );
}
