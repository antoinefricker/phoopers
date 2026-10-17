# Creating a system — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "New play" and "Starting formation" buttons with one menu and one creation dialog that produces a named, immediately editable system on the court it declares.

**Architecture:** Two optional fields join `Play` — `extent` and `duration` — and the engine turns the second into a floor for the resolved timeline. Everything that previously reasoned about the full floor (the viewBox margin, pointer clamping, where a new player lands) starts reasoning about the _displayed_ area plus a one-metre margin, through one `bounds` module. A new `createPlay` mutation builds a whole system from a lineup table, and the UI shrinks to a popover menu and a modal.

**Tech Stack:** React 19, TypeScript, Mantine 9, Vitest, react-i18next.

**Spec:** [documentation/specs/005-17-10-2026-system-creation.md](../specs/005-17-10-2026-system-creation.md)

## Decisions

| Decision                                                                        | Rejected alternative                                    | Why                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `extent` and `duration` optional on `Play`, read through `extentOf` / `?? 0`    | Required fields, migrating every fixture and the sample | Thirty-odd fixtures and `hornsPlay` keep working untouched, and part B can persist the fields without a migration for plays that predate it.                                         |
| `duration` is a floor, `max(play.duration, last keyframe)`                      | Authoritative duration that caps the timeline           | The problem being solved is a zero-width timeline, not duration control. An authoritative duration needs an editing control this lot does not ship.                                  |
| Half court is always the right-hand half                                        | Keep `attackingSide(timeline)`                          | It infers the side from offense positions and falls back to the left half when there is none, so an empty half-court system would open on the wrong side.                            |
| `extent` travels as a prop to `PlayCanvas`                                      | Add `extent` to `ResolvedTimeline`                      | The canvas reads the resolved timeline so the 1b view tests can render it with no editor; a drawing decision has no business in the engine, and `playName` already takes this route. |
| One `bounds` module owning the margin, consumed by `pointer.ts` and `addPlayer` | Clamp inline in each caller                             | Three call sites would otherwise each hold their own copy of "displayed area plus a metre", and the viewBox apron has to agree with them.                                            |
| `applyFormation` deleted rather than kept as unreachable API                    | Keep it tested but unused                               | It appends to the roster and hands the ball to the point guard — the opposite of creation — so keeping it means maintaining a second, wrong way to seat a team.                      |
| The lineup table carries positions only; `createPlay` mints ids                 | Lineups that build `Player` objects                     | Keeps the table a data file and every mutation a pure function of its arguments, which is how the existing mutations are written.                                                    |

## Global Constraints

- All user-facing strings go through `t('<prefix>.<key>', 'English default')`; the French catalogue is filled in the same commit. New keys live under `play.menu.*` and `play.create.*`.
- English is the language of code, comments, commit messages and English defaults; French is the `fr` catalogue only.
- Conventional commits, no co-author lines. One commit per task, proposed to the user and approved before it is made.
- `pnpm lint` passes before every commit; `pnpm --filter @phoopers/pwa test` is the test command.
- Court coordinates are FIBA metres on the full-court plane, attacked basket on the right.
- The one-metre editing margin and the viewBox apron are the same metre: `APRON` and `DROP_MARGIN` must not drift apart.

## Review Focus

Input classes the spec implies that no task's happy path exercises. Each has its test placed in the task that owns the code.

- A branch whose tracks are all empty, on a play carrying `duration` — the floor must still apply rather than reducing over nothing to 0. _(Task 1)_
- A name of nothing but spaces — the dialog must refuse it, not create a system called `"   "`. _(Task 6)_
- A half-court system on an NBA floor — bounds and viewBox must come from the NBA length, not a hard-coded 14. _(Task 3)_
- A drag that leaves the displayed half on a half-court system — it must stop at the margin, not vanish where it can never be clicked again. _(Task 3)_
- Creating while a non-root branch is selected and the clock is running — the new system must come up on its own root with the clock reset. _(Task 5)_

---

### Task 1: Extent and duration in the model

**Files:**

- Modify: `apps/pwa/src/engine/types.ts` (the `Play` interface)
- Create: `apps/pwa/src/engine/extent.ts`
- Modify: `apps/pwa/src/engine/index.ts` (re-export)
- Modify: `apps/pwa/src/engine/resolve.ts:293-296` (the `duration` reduce)
- Test: `apps/pwa/src/engine/extent.test.ts`, `apps/pwa/src/engine/resolve.test.ts`

**Interfaces:**

- Produces: `Play.extent?: CourtExtent`, `Play.duration?: number`; `type CourtExtent = 'full' | 'half'`; `extentOf(play: Pick<Play, 'extent'>): CourtExtent`.

- [ ] **Step 1: Write the failing tests**

```ts
// extent.test.ts
it('defaults to the full court when the play does not say', () => {
  expect(extentOf({ ...samplePlay, extent: undefined })).toBe('full');
});
it('reads the play when it does', () => {
  expect(extentOf({ ...samplePlay, extent: 'half' })).toBe('half');
});

// resolve.test.ts
it('is at least the play duration when nothing moves past it', () => {
  const play = { ...onePlayerAtZero, duration: 8 };
  expect(resolveBranch(play, play.rootBranchId).duration).toBe(8);
});
it('is the last keyframe when the animation runs past the play duration', () => {
  const play = { ...onePlayerMovingUntil11, duration: 8 };
  expect(resolveBranch(play, play.rootBranchId).duration).toBe(11);
});
it('is the play duration on a branch with no keyframes at all', () => {
  const play = { ...emptyRootBranch, duration: 8 };
  expect(resolveBranch(play, play.rootBranchId).duration).toBe(8);
});
it('is unchanged for a play that carries no duration', () => {
  expect(resolveBranch(onePlayerAtZero, onePlayerAtZero.rootBranchId).duration).toBe(0);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @phoopers/pwa test -- extent resolve`
Expected: FAIL — `extentOf` is not exported, the duration tests report 0 and 11.

- [ ] **Step 3: Add the fields and the floor**

Add both optional fields to `Play` with doc comments saying `extent` is persisted (not a view setting) and `duration` is a floor in seconds. Write `extentOf` in `extent.ts`, export `extentOf` and `CourtExtent` from the engine barrel. In `resolve.ts`, seed the existing reduce with `play.duration ?? 0` instead of `0`.

- [ ] **Step 4: Run the whole engine suite**

Run: `pnpm --filter @phoopers/pwa test -- engine`
Expected: PASS, including every existing fixture that carries neither field.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add apps/pwa/src/engine
git commit -m "feat: give a play a court extent and a duration floor"
```

---

### Task 2: A margin wide enough to stand in

**Files:**

- Modify: `apps/pwa/src/play2d/geometry/court.ts:137-154`
- Test: `apps/pwa/src/play2d/geometry/court.test.ts`

**Interfaces:**

- Produces: `APRON = 1`; `halfCourtViewBox(court, side)` with the apron on all four sides.

- [ ] **Step 1: Write the failing tests**

```ts
it('leaves a metre of apron around the full court', () => {
  expect(fullCourtViewBox('fiba')).toBe('-1 -1 30 17');
});
it('leaves the same metre past the halfway line', () => {
  expect(halfCourtViewBox('fiba', 'right')).toBe('13 -1 16 17');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @phoopers/pwa test -- court`
Expected: FAIL — the current apron is 0.5 and the halfway cut is flush.

- [ ] **Step 3: Widen the apron**

Set `APRON = 1` with a comment tying it to `DROP_MARGIN` (Task 3): a token may stand a metre out, and the viewBox must show it. In `halfCourtViewBox`, give the halfway cut the same apron as the other three sides — `x` moves out by `APRON` on both sides and the width becomes `half + APRON * 2`. Update the comment that currently explains why the cut has none.

- [ ] **Step 4: Run the view suite**

Run: `pnpm --filter @phoopers/pwa test -- play2d`
Expected: PASS. Fix any snapshot or geometry test that pinned the old numbers.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add apps/pwa/src/play2d/geometry
git commit -m "feat: widen the court apron to a metre"
```

---

### Task 3: Editing bounds follow the displayed court

**Files:**

- Create: `apps/pwa/src/editor/bounds.ts`
- Modify: `apps/pwa/src/editor/pointer.ts:4-34` (`clampToCourt`, `courtPointFromEvent`)
- Modify: `apps/pwa/src/editor/mutations/players.ts` (the `centre` helper and `addPlayer`)
- Modify: `apps/pwa/src/editor/CourtEditLayer.tsx:65` (pass the play, not `play.court`)
- Test: `apps/pwa/src/editor/bounds.test.ts`, `apps/pwa/src/editor/pointer.test.ts`

**Interfaces:**

- Consumes: `extentOf` (Task 1).
- Produces: `type CourtChoice = Pick<Play, 'court' | 'extent'>`; `DROP_MARGIN = 1`; `courtBounds(play: CourtChoice): { minX: number; maxX: number; minY: number; maxY: number }`; `displayedCentre(play: CourtChoice): Vec2`; `clampToCourt(point: Vec2, play: CourtChoice): Vec2`; `courtPointFromEvent(event, svg, play: CourtChoice): Vec2`.

  The two geometry helpers take `CourtChoice`, not a whole `Play`, so `createPlay` (Task 4) can place the ball from the court it is about to build before any `Play` object exists. `extentOf` (Task 1) widens to the same parameter type.

- [ ] **Step 1: Write the failing tests**

```ts
// bounds.test.ts
it('is the whole floor plus a metre on a full court', () => {
  expect(courtBounds(fibaFullPlay)).toEqual({ minX: -1, maxX: 29, minY: -1, maxY: 16 });
});
it('starts a metre before the halfway line on a half court', () => {
  expect(courtBounds(fibaHalfPlay)).toEqual({ minX: 13, maxX: 29, minY: -1, maxY: 16 });
});
it('reads the NBA length rather than assuming FIBA', () => {
  expect(courtBounds({ ...fibaHalfPlay, court: 'nba' }).minX).toBeCloseTo(13.325);
});
it('centres on the shown half', () => {
  expect(displayedCentre(fibaHalfPlay)).toEqual({ x: 21, y: 7.5 });
});

// pointer.test.ts
it('stops a drag at the margin rather than losing it off the shown half', () => {
  expect(clampToCourt({ x: 4, y: 7.5 }, fibaHalfPlay)).toEqual({ x: 13, y: 7.5 });
});
it('lets a player stand a metre out of bounds', () => {
  expect(clampToCourt({ x: 21, y: -0.8 }, fibaHalfPlay)).toEqual({ x: 21, y: -0.8 });
});
it('falls back to the centre of what is shown when there is no CTM', () => {
  expect(courtPointFromEvent(anyEvent, null, fibaHalfPlay)).toEqual({ x: 21, y: 7.5 });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @phoopers/pwa test -- bounds pointer`
Expected: FAIL — `bounds.ts` does not exist and `clampToCourt` takes a court, not a play.

- [ ] **Step 3: Write `bounds.ts` and rethread the callers**

`courtBounds` reads `COURT_DIMENSIONS[play.court]` and `extentOf(play)`: the displayed area is the whole floor, or `length / 2 .. length` when half, expanded by `DROP_MARGIN` on every side. `displayedCentre` is the midpoint of those bounds _without_ the margin — the centre of the floor, or of the shown half. Change `clampToCourt` and `courtPointFromEvent` to take `play: Play`, keeping the NaN guard but returning `displayedCentre(play)`. In `players.ts`, replace the private `centre` helper with `displayedCentre`.

- [ ] **Step 4: Run the editor suite**

Run: `pnpm --filter @phoopers/pwa test -- editor`
Expected: PASS. `CourtEditLayer` and any test calling the two pointer functions need their argument changed.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add apps/pwa/src/editor
git commit -m "feat: bound editing to the displayed court plus a metre"
```

---

### Task 4: Starting placements and the create mutation

**Files:**

- Create: `apps/pwa/src/editor/lineups.ts`
- Delete: `apps/pwa/src/editor/formation.ts`
- Create: `apps/pwa/src/editor/mutations/create.ts`
- Modify: `apps/pwa/src/editor/mutations/index.ts`
- Modify: `apps/pwa/src/editor/mutations/players.ts` (remove `applyFormation` and `FormationIds`)
- Test: `apps/pwa/src/editor/mutations/create.test.ts`

**Interfaces:**

- Consumes: `displayedCentre` (Task 3), `extentOf` (Task 1).
- Produces:
  - `type LineupKind = 'empty' | 'fiveOnFive' | 'threeOnThree'`
  - `const LINEUPS: Record<LineupKind, { offense: Vec2[]; defense: Vec2[] }>`
  - `interface CreatePlayOptions { name: string; court: Play['court']; extent: CourtExtent; lineup: LineupKind; duration: number }`
  - `interface CreatePlayIds { playId: PlayId; rootBranchId: BranchId; offense: PlayerId[]; defense: PlayerId[] }`
  - `createPlay(options: CreatePlayOptions, ids: CreatePlayIds): Play`

- [ ] **Step 1: Write the failing tests**

```ts
it('seats five against five with a keyframe each at zero', () => {
  const play = createPlay({ ...fiveOnFiveHalf }, ids(5, 5));
  expect(play.players).toHaveLength(10);
  expect(play.branches[0].tracks[ids5.offense[0]]).toEqual([{ t: 0, position: { x: 16, y: 7.5 } }]);
});
it('numbers each side from one', () => {
  const play = createPlay({ ...fiveOnFiveHalf }, ids(5, 5));
  expect(play.players.filter((p) => p.team === 'defense').map((p) => p.number)).toEqual(['1', '2', '3', '4', '5']);
});
it('leaves the ball loose at the centre of what is shown', () => {
  const play = createPlay({ ...emptyHalf }, ids(0, 0));
  expect(play.branches[0].tracks.ball).toEqual([{ t: 0, position: { x: 21, y: 7.5 } }]);
});
it('shifts the ball towards midcourt when the centre is on a player', () => {
  const play = createPlay({ ...threeOnThreeHalf }, ids(3, 3));
  expect(play.branches[0].tracks.ball).toEqual([{ t: 0, position: { x: 19, y: 7.5 } }]);
});
it('carries the name, court, extent and duration it was given', () => {
  const play = createPlay({ name: 'Flex', court: 'fiba', extent: 'half', lineup: 'empty', duration: 8 }, ids(0, 0));
  expect(play).toMatchObject({ name: 'Flex', court: 'fiba', extent: 'half', duration: 8 });
  expect(play.branches[0].name).toBe('Flex');
});
it('passes validation for every lineup', () => {
  for (const lineup of ['empty', 'fiveOnFive', 'threeOnThree'] as const) {
    expect(validatePlay(createPlay({ ...base, lineup }, idsFor(lineup)))).toEqual([]);
  }
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @phoopers/pwa test -- create`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the lineup table**

In `lineups.ts`, move `FORMATION` in as `fiveOnFive` unchanged, add `empty` (both sides `[]`) and `threeOnThree` with the spec's six positions — offense `(21, 7.5) (23, 3) (25.2, 10.2)`, defense `(22, 7.5) (23.6, 3.8) (25.6, 9.3)`. Delete `formation.ts`.

- [ ] **Step 4: Write `createPlay`**

Build players in roster order, offense then defense, numbering each side from "1" with `nextNumber`, one keyframe at `t: 0` per player. Place the ball at `displayedCentre` of the play being built, shifted to `x - 2` when a player sits within `BALL_CLEARANCE` (0.7 m, the court layer's player hit radius) of it. Export `BALL_CLEARANCE` from `create.ts`. Delete `applyFormation` and `FormationIds` from `players.ts`, and re-export `createPlay` from `mutations/index.ts`.

- [ ] **Step 5: Run the editor suite and commit**

Run: `pnpm --filter @phoopers/pwa test -- editor`
Expected: PASS; the `applyFormation` tests are gone with the function.

```bash
pnpm lint
git add apps/pwa/src/editor
git commit -m "feat: build a system from a starting placement"
```

---

### Task 5: The editor context creates systems

**Files:**

- Modify: `apps/pwa/src/editor/useEditorContext.ts` (the `EditorContextValue` interface)
- Modify: `apps/pwa/src/editor/EditorContextProvider.tsx:33-42, 112-137, 149-199`
- Test: `apps/pwa/src/editor/EditorContextProvider.test.tsx`

**Interfaces:**

- Consumes: `createPlay`, `LineupKind`, `CreatePlayOptions` (Task 4).
- Produces: `createPlay: (options: Omit<CreatePlayOptions, 'duration'>) => void` on the context; `NEW_PLAY_DURATION = 8` exported from `EditorContextProvider.tsx`. `newPlay` and `applyFormation` are gone.

- [ ] **Step 1: Write the failing tests**

```ts
it('replaces the play with a fresh one on its own root branch', () => {
  // render the probe, create, then assert
  expect(play.id).not.toBe(hornsPlay.id);
  expect(play.branches).toHaveLength(1);
  expect(play.rootBranchId).toBe(play.branches[0].id);
});
it('gives a new system eight seconds of timeline', () => {
  expect(play.duration).toBe(8);
});
it('clears the selection', () => {
  // select a player, then create
  expect(selection).toBeNull();
});
it('comes up on its own root with the clock reset, from a forked branch mid-playback', () => {
  // fork, select the child, scrub to 3s, play, then create
  expect(play.branches).toHaveLength(1);
  expect(screen.getByRole('slider', { name: /time/i })).toHaveValue('0');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @phoopers/pwa test -- EditorContextProvider`
Expected: FAIL — the context exposes `newPlay`, not `createPlay`.

- [ ] **Step 3: Swap the methods**

Replace `newPlay` with `createPlay` in the interface and the provider: it mints a `PlayId`, a `BranchId` and one `PlayerId` per seat in the chosen lineup, calls `mutations.createPlay` with `duration: NEW_PLAY_DURATION`, and clears the selection exactly as `newPlay` did. Delete `applyFormation` from the interface, the provider and both `useMemo` dependency lists. Keep the comment explaining that a fresh `PlayId` is what remounts the playback provider.

- [ ] **Step 4: Run the editor suite**

Run: `pnpm --filter @phoopers/pwa test -- editor`
Expected: PASS. `ConfirmDelete.test.tsx` and any other caller of `newPlay` moves to `createPlay`.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add apps/pwa/src/editor
git commit -m "feat: create a system through the editor context"
```

---

### Task 6: The menu and the creation dialog

**Files:**

- Create: `apps/pwa/src/editor/PlayMenu.tsx`
- Create: `apps/pwa/src/editor/CreatePlayDialog.tsx`
- Modify: `apps/pwa/src/editor/EditorToolbar.tsx`
- Modify: `apps/pwa/src/play2d/PlayView.tsx:26, 80-95, 160`
- Modify: `apps/pwa/src/play2d/PlayCanvas.tsx:12-32`
- Delete: `apps/pwa/src/play2d/geometry/attackingSide.ts` and `attackingSide.test.ts`
- Test: `apps/pwa/src/editor/createPlayDialog.test.tsx`

**Interfaces:**

- Consumes: `createPlay` from the context (Task 5), `extentOf` (Task 1), `LineupKind` (Task 4).
- Produces: `PlayCanvas` prop `extent: CourtExtent` replacing `halfCourt: boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
it('refuses a name of nothing but spaces', async () => {
  // open the dialog, type '   '
  expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
});
it('warns that the open system will be discarded', () => {
  expect(screen.getByText(/will be discarded/i)).toBeInTheDocument();
});
it('creates the system it was asked for and closes', async () => {
  // name 'Flex', half court, 3 on 3, submit
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Flex/ })).toBeInTheDocument();
});
it('offers saving but cannot do it yet', () => {
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
it('draws the half the system declares, with no view control to disagree', () => {
  expect(screen.queryByLabelText('Court view')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Flex/ })).toHaveAttribute('viewBox', '13 -1 16 17');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @phoopers/pwa test -- createPlayDialog`
Expected: FAIL — neither component exists.

- [ ] **Step 3: Write `PlayMenu`**

An `ActionIcon` with `IconDotsVertical` and `aria-label` from `t('play.menu.label', 'System menu')`, opening a controlled `Popover` the way `PlayView`'s branches menu already is. Two full-width `Button`s with `variant="subtle"`: `play.menu.create` ("Create a new system"), which closes the popover and opens the dialog, and `play.menu.save` ("Save"), `disabled`, wrapped in a `Tooltip` reading `play.menu.saveSoon` ("Saving arrives with persistence").

- [ ] **Step 4: Write `CreatePlayDialog`**

A Mantine `Modal` with `title` from `play.create.title`. A required `TextInput` for the name; a `Radio.Group` for the court with `fiba-full` and `fiba-half`; a `Radio.Group` for the placement with `empty`, `fiveOnFive`, `threeOnThree`, defaulting to `fiba-full` and `empty`. An `Alert` above the actions carrying `play.create.discard`. The submit button is disabled while the trimmed name is empty; submitting calls the context's `createPlay` and closes. Mount it with a `key` that changes on each open, per the React 19 strict-effects rule in `AGENTS.md`, so the fields reset without an effect.

- [ ] **Step 5: Rewire the toolbar and the view**

In `EditorToolbar`, delete both buttons and the `ConfirmDelete` block, and render `PlayMenu` in edit mode. In `PlayView`, delete the `halfCourt` state and the court-view `SegmentedControl`, and pass `extent={extentOf(play)}` to `PlayCanvas`. In `PlayCanvas`, take `extent` and choose `halfCourtViewBox(court, 'right')` or `fullCourtViewBox(court)`; drop the `attackingSide` import and delete the module and its test.

- [ ] **Step 6: Run the whole suite**

Run: `pnpm --filter @phoopers/pwa test`
Expected: PASS. The 1b view tests that rendered `PlayCanvas` with `halfCourt` move to `extent`.

- [ ] **Step 7: Lint and commit**

```bash
pnpm lint
git add apps/pwa/src
git commit -m "feat: create a system from a menu and a dialog"
```

---

### Task 7: Strings

**Files:**

- Modify: `apps/pwa/src/i18n/locales/en/common.json`, `apps/pwa/src/i18n/locales/fr/common.json`

- [ ] **Step 1: Extract**

Run: `pnpm --filter @phoopers/pwa extract:i18n`
Expected: the new `play.menu.*` and `play.create.*` keys land in both catalogues, English filled from the defaults, French empty.

- [ ] **Step 2: Translate**

Fill every new French value. In the same pass, change the French wording for a play to « système » throughout the existing `play.*` keys — the English stays "play".

- [ ] **Step 3: Check**

Run: `pnpm --filter @phoopers/pwa i18n:check`
Expected: PASS — no missing, orphaned or unimported key. Removed keys from the deleted buttons may linger, extraction being non-destructive; delete them by hand.

- [ ] **Step 4: Lint and commit**

```bash
pnpm lint
git add apps/pwa/src/i18n
git commit -m "feat: translate the system creation strings"
```

---

### Task 8: Documentation

**Files:**

- Modify: `documentation/specs/index.md`, `documentation/plans/index.md`, `AGENTS.md` (the Status section)

- [ ] **Step 1: Mark it shipped**

Set spec 005 and plan 006 to "Implemented" in both indexes. Update `AGENTS.md`'s Status paragraph to say part A of 1d has landed and part B — accounts and Supabase persistence — is next.

- [ ] **Step 2: Record anything knowingly left**

If the implementation left a limitation (an unreachable position, a lineup that only suits one court), add it to `documentation/limitations.md` with what it costs measured, not estimated. If none was left, change nothing.

- [ ] **Step 3: Commit**

```bash
pnpm lint
git add documentation AGENTS.md
git commit -m "docs: mark system creation implemented"
```
