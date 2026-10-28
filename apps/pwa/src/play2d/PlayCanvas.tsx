import { useContext } from 'react';
import type { CourtExtent } from '../engine';
import { useTranslation } from 'react-i18next';
import { CourtEditLayer } from '../editor/CourtEditLayer';
import { EditorContext } from '../editor/useEditorContext';
import { usePlaybackContext } from './usePlaybackContext';
import { Court } from './Court';
import { PathLayer } from './PathLayer';
import { TokenLayer } from './TokenLayer';
import { CourtTurnContextProvider } from './CourtTurnContextProvider';
import { fullCourtViewBox, halfCourtTurn, halfCourtViewBox } from './geometry/court';

interface Props {
  /**
   * How much of the floor to draw. Comes from the play rather than from a control of its own:
   * a system declares its court, and nothing on screen may disagree with it.
   */
  extent: CourtExtent;
  /** The play's own name: data, so it is interpolated into the label, never translated. */
  playName: string;
}

export function PlayCanvas({ extent, playName }: Props) {
  const { t } = useTranslation();
  const { timeline } = usePlaybackContext();
  const court = timeline.court;
  // Read the context directly rather than through useEditorContext: the view still renders
  // without an editor around it (the 1b tests do), and then there is simply nothing to edit.
  // `BranchTree` reads it the same way, for the same reason; `useEditorContext` is for the
  // components that only exist inside an editor.
  const editing = useContext(EditorContext)?.mode === 'edit';
  // Always the right-hand half: the attacked basket is on the right by convention, and
  // inferring the side from where the offense stands opens an empty system on the wrong one.
  const half = extent === 'half';
  const turn = half ? halfCourtTurn('right') : 0;

  return (
    <svg
      role="img"
      aria-label={t('play.canvas.label', 'Court diagram: {{name}}', { name: playName })}
      // The half is framed as it is drawn, turned a quarter to landscape with its basket up.
      viewBox={half ? halfCourtViewBox(court, 'right') : fullCourtViewBox(court)}
      // block: an inline svg sits on the text baseline and leaves a descender gap below it.
      // It fills a panel whose height its container decides, and keeps its own aspect ratio
      // inside it — a court wider or taller than the drawing shows the floor's colour either
      // side, which the panel is painted with for exactly that reason.
      // The court is a drawing, not prose: its labels are part of the symbol, so a drag across
      // it must move tokens rather than highlight "1 2 3 4 5 X1 …".
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        userSelect: 'none',
      }}
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
      {/* Everything on the court shares one frame, so one turn on one group turns it all: the
          floor, the paths, the tokens and the edit layer, whose pointer maths reads this group's
          own transform. Engine coordinates stay the full court's, turned or not. */}
      <g data-testid="court-turn" transform={half ? `rotate(${turn})` : undefined}>
        <CourtTurnContextProvider turn={turn}>
          <Court court={court} side={half ? 'right' : undefined} />
          <PathLayer />
          <TokenLayer />
          {editing && <CourtEditLayer />}
        </CourtTurnContextProvider>
      </g>
    </svg>
  );
}
