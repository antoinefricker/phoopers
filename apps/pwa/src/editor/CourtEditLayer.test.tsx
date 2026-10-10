import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Play } from '../engine';
import { fixturePlay, P1, P2, ROOT, SWITCH } from '../engine/__fixtures__/play';
import { PlayCanvas } from '../play2d/PlayCanvas';
import { CourtEditLayer } from './CourtEditLayer';
import { useEditorContext } from './useEditorContext';
import { dragToken, readProbe, renderEditor, SeekTo, SelectBranch, trackOf } from './testUtils/renderEditor';

// The layer is an SVG fragment, so give it the svg it will have in PlayCanvas.
const layer = (
  <svg>
    <CourtEditLayer />
  </svg>
);

describe('CourtEditLayer', () => {
  it('replaces the keyframe at the playhead', async () => {
    renderEditor(fixturePlay, layer);
    const before = trackOf(readProbe().play, ROOT, P1).length;

    await dragToken(P1);

    // The fixture's P1 has keyframes at t = 0, 2, 4. The drag lands at the playhead (t = 0),
    // replacing that one, so a single commit leaves the count unchanged; three commits at one
    // time would too. The seek test below pins "adds one" at a fresh time.
    expect(trackOf(readProbe().play, ROOT, P1)).toHaveLength(before);
  });

  it('gains one keyframe at a fresh time', async () => {
    renderEditor(
      fixturePlay,
      <>
        {layer}
        <SeekTo t={1} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'seek 1' }));
    const before = trackOf(readProbe().play, ROOT, P1).length;

    await dragToken(P1);

    // A fresh time gains exactly one keyframe. This cannot tell one commit from three at the
    // same time (they overwrite each other), so the per-move guard is the next test, which
    // requires the play to be byte-identical while the pointer is down.
    const after = trackOf(readProbe().play, ROOT, P1);
    expect(after.length).toBe(before + 1);
    expect(after.some((k) => k.t === 1)).toBe(true);
  });

  it('writes the keyframe at the current playhead time', async () => {
    renderEditor(fixturePlay, layer);

    await dragToken(P1);

    const times = trackOf(readProbe().play, ROOT, P1).map((k) => k.t);
    expect(times.filter((t) => t === 0)).toHaveLength(1);
  });

  it('moves the keyframe to the released point', async () => {
    renderEditor(fixturePlay, layer);

    await dragToken(P1);

    // No layout in jsdom, so the release point is the court centre.
    expect(trackOf(readProbe().play, ROOT, P1)[0]).toMatchObject({ t: 0, position: { x: 14, y: 7.5 } });
  });

  it('leaves the play untouched while the pointer is still down', async () => {
    renderEditor(fixturePlay, layer);
    const user = userEvent.setup();
    const token = screen.getByTestId(`edit-token-${P1}`);
    const before = JSON.stringify(readProbe().play);

    await user.pointer([
      { keys: '[MouseLeft>]', target: token },
      { target: token, coords: { clientX: 90, clientY: 90 } },
    ]);

    expect(JSON.stringify(readProbe().play)).toBe(before);
  });

  it('does not start a drag before the fork on a child branch', async () => {
    renderEditor(
      fixturePlay,
      <>
        {layer}
        <SelectBranch branchId={SWITCH} />
      </>,
    );
    // Select the child branch first. 'Defence switches' forks at 'Entry pass' (t = 2) and the
    // clock is still at 0, so the playhead is before the fork.
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));
    const before = JSON.stringify(readProbe().play);

    await dragToken(P1);

    expect(JSON.stringify(readProbe().play)).toBe(before);
  });

  describe('the fork guard in the UI', () => {
    // jsdom has no pointer capture; stub it so the gesture's first side effect is observable.
    const setPointerCapture = vi.fn();
    const original = SVGElement.prototype.setPointerCapture;
    afterEach(() => {
      SVGElement.prototype.setPointerCapture = original;
      setPointerCapture.mockClear();
    });

    const renderOnChild = async (seekTo?: number) => {
      SVGElement.prototype.setPointerCapture = setPointerCapture;
      renderEditor(
        fixturePlay,
        <>
          {layer}
          <SelectBranch branchId={SWITCH} />
          <SeekTo t={seekTo ?? 0} />
        </>,
      );
      await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));
      if (seekTo !== undefined) await userEvent.click(screen.getByRole('button', { name: `seek ${seekTo}` }));
    };

    const pressAndMove = async () => {
      const token = screen.getByTestId(`edit-token-${P1}`);
      await userEvent.setup().pointer([
        { keys: '[MouseLeft>]', target: token },
        { target: token, coords: { clientX: 80, clientY: 60 } },
      ]);
    };

    it('takes no pointer capture and shows no ghost before the fork', async () => {
      await renderOnChild();

      await pressAndMove();

      expect(setPointerCapture).not.toHaveBeenCalled();
      expect(screen.getByTestId('edit-ghost')).toHaveAttribute('visibility', 'hidden');
    });

    it('takes pointer capture and shows the ghost mid-gesture after the fork', async () => {
      await renderOnChild(3);

      await pressAndMove();

      expect(setPointerCapture).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('edit-ghost')).toHaveAttribute('visibility', 'visible');
    });
  });

  it('writes on the child branch once the playhead is past the fork', async () => {
    renderEditor(
      fixturePlay,
      <>
        {layer}
        <SelectBranch branchId={SWITCH} />
        <SeekTo t={3} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: `select ${SWITCH}` }));
    await userEvent.click(screen.getByRole('button', { name: 'seek 3' }));

    await dragToken(P1);

    // P1 has a single keyframe at t = 3 on this branch; the drag replaces it.
    expect(trackOf(readProbe().play, SWITCH, P1)).toEqual([{ t: 3, position: { x: 14, y: 7.5 } }]);
    expect(trackOf(readProbe().play, ROOT, P1)).toHaveLength(3);
  });

  describe('the ball', () => {
    // The release point is the court centre in jsdom, so put P2 there to be a drop target.
    const centred: Play = {
      ...fixturePlay,
      branches: fixturePlay.branches.map((b) =>
        b.id === ROOT ? { ...b, tracks: { ...b.tracks, [P2]: [{ t: 0, position: { x: 14, y: 7.5 } }] } } : b,
      ),
    };

    it('attaches to a player when dropped within the snap radius', async () => {
      renderEditor(centred, layer);

      await dragToken('ball');

      expect(trackOf(readProbe().play, ROOT, 'ball')[0]).toEqual({ t: 0, attachedTo: P2 });
    });

    it('is released to a free position when dropped on open court', async () => {
      renderEditor(fixturePlay, layer);

      await dragToken('ball');

      // Nobody is at the court centre in the fixture, so there is nothing to attach to.
      expect(trackOf(readProbe().play, ROOT, 'ball')[0]).toEqual({ t: 0, position: { x: 14, y: 7.5 } });
    });
  });
});

function EditModeButton() {
  const { setMode } = useEditorContext();

  return (
    <button type="button" onClick={() => setMode('edit')}>
      enter edit
    </button>
  );
}

describe('PlayCanvas', () => {
  it('shows the edit layer only in edit mode', async () => {
    renderEditor(
      fixturePlay,
      <>
        <PlayCanvas halfCourt={false} playName="Test" />
        <EditModeButton />
      </>,
    );

    expect(screen.queryByTestId(`edit-token-${P1}`)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'enter edit' }));

    expect(screen.getByTestId(`edit-token-${P1}`)).toBeInTheDocument();
  });
});
