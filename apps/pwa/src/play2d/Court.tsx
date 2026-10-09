import { courtMarkings, type CourtType } from './geometry/court';

interface Props {
  court: CourtType;
}

export function Court({ court }: Props) {
  return (
    <g data-testid="court" fill="none" stroke="currentColor" strokeWidth={0.05} opacity={0.6}>
      {courtMarkings(court).map((marking, index) => {
        const key = `${marking.kind}-${index}`;
        switch (marking.kind) {
          case 'rect':
            return <rect key={key} x={marking.x} y={marking.y} width={marking.w} height={marking.h} />;
          case 'line':
            return <line key={key} x1={marking.x1} y1={marking.y1} x2={marking.x2} y2={marking.y2} />;
          case 'circle':
            return <circle key={key} cx={marking.cx} cy={marking.cy} r={marking.r} />;
          case 'path':
            return <path key={key} d={marking.d} />;
        }
      })}
    </g>
  );
}
