import { usePlaybackContext } from './usePlaybackContext';
import { Court } from './Court';
import { PathLayer } from './PathLayer';
import { fullCourtViewBox, halfCourtViewBox } from './geometry/court';

interface Props {
  halfCourt: boolean;
}

export function PlayCanvas({ halfCourt }: Props) {
  const { timeline } = usePlaybackContext();
  const court = timeline.court;

  return (
    <svg
      role="img"
      viewBox={halfCourt ? halfCourtViewBox(court) : fullCourtViewBox(court)}
      style={{ width: '100%', height: '100%' }}
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
    </svg>
  );
}
