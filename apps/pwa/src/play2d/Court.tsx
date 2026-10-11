import { COURT_DIMENSIONS } from '../engine';
import { APRON, LINE_WIDTH, courtMarkings, type CourtType } from './geometry/court';

// The floor's wood tone, still being tuned between looks and legibility.
//
// The constraint it has to meet, when that settles: the white markings and the white rim round
// each token share one ratio against this colour, and 3:1 is the floor for a graphic that
// carries meaning. Lightness is what moves it — the hue and saturation are free. For this hue
// at 52% saturation the threshold sat at 46% lightness; paler than that and the lines fade.
//
// The token FILLS cannot be fixed by choosing a different wood: a mid-luminance blue, red or
// orange never clears 3:1 against any of them, because the floor passes through their value on
// its way darker. Their white rim is what separates them, and it follows the markings' ratio.
export const FLOOR = '#d5c49a';

interface Props {
  court: CourtType;
}

export function Court({ court }: Props) {
  return (
    <>
      {/* The floor covers the playing surface and the apron around it, which is exactly what
          every viewBox frames — so the wood reaches the edge of the picture on every side and
          no sliver of page shows through. */}
      <rect
        data-testid="court-floor"
        x={-APRON}
        y={-APRON}
        width={COURT_DIMENSIONS[court].length + APRON * 2}
        height={COURT_DIMENSIONS[court].width + APRON * 2}
        fill={FLOOR}
      />
      {/* Full opacity: a line at 0.6 washes out against the floor, and the whole point of the
          white is that the markings read. */}
      <g data-testid="court" fill="none" stroke="var(--mantine-color-white)" strokeWidth={LINE_WIDTH}>
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
    </>
  );
}
