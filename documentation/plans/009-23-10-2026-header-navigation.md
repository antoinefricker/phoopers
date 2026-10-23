# Header navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One menu, on every page. The burger that today exists only in the editor becomes the app's single way around — create, browse, my systems, account — and the editor's own actions (clear, save, mode) become one group inside it, shown only while editing. The header loses its separate account button, and the wordmark grows.

**Architecture:** `AppMenu` moves to `apps/pwa/src/app/`. It owns the burger, the drawer, the Navigation and Account groups, and the two dialogs those need (`CreateSystemDialog`, `DisplayNameDialog`). It knows nothing about the editor: a page that has one passes an `editing` **render prop** — called with the drawer's `close` — plus a `dirty` flag for the burger's dot. `PlayMenu` stays in `apps/pwa/src/editor/`, shrinks to that render prop's content, and keeps the editor-only state it already has (`useSaveSystem`, the mode toggle, and the new clear confirmation). `AppShell` renders `<AppHeader leading={<AppMenu />} />`, so every non-editor page gets the menu for free; `PlayView` keeps passing its own.

Clearing a system is a new pure mutation, `clearPlay`, rather than a call to `createPlay`: the open system keeps its id, its name, its court and its length, so a save after a clear still overwrites the row the coach came from instead of silently making a second system.

**Tech Stack:** React 19, TypeScript, Mantine 9, React Router 7, TanStack Query 5, Vitest, react-i18next.

**Spec:** none of its own. This amends the interface described in [spec 005](../specs/005-17-10-2026-system-creation.md) (creation) and [spec 006](../specs/006-18-10-2026-accounts-and-persistence.md) (accounts, library, my systems); both keep their behaviour, only the way in changes.

## How it came out

Implemented as planned, with four corrections the work itself forced. They are recorded here
rather than silently in the diff, because each one is a decision somebody will otherwise have
to re-derive.

- **The mode entry stays in the Editing group in both modes**, which is the reading assumed
  below; it was approved at review. Clear and Save are the edit-only entries.
- **`clearPlay` keeps the root branch's id**, so its signature is `clearPlay(play)` with no ids
  to mint. Nothing remounts on a clear — the play id never changes — so a playback context
  pointing at the root would otherwise resolve a branch that is gone, and `resolveBranch` throws
  on one. The menu still selects the root and seeks to 0, since the coach may have been watching
  a variant.
- **`AppMenu` can be controlled** (`opened` / `onOpenedChange`), and the editor owns that state.
  The save chord fires while the drawer is closed and has to be able to close it, and a `close`
  handed out during a render cannot be stored without setting state from inside another
  component's render.
- **`CreateSystemDialog` moved to `src/app/` and reads `EditorContext` itself** rather than
  taking a `hideDiscardWarning` prop. The menu offers creation everywhere, but in the editor the
  new system has to replace the open one through the context that is already there; hosting a
  throwaway one and navigating to `/play`, as it does elsewhere, left the coach looking at the
  old system. That makes `src/app/` import from `src/editor/`, which the constraint below
  forbade: the constraint was wrong, since the creation dialog is editor-backed by nature.

## Open concern, settled at review

The mode entry ("Edit mode" / "Play mode") was asked to live inside the **Edition** group, and that group shows only in edit mode. Taken literally, a coach who switches to play mode can only come back with `Alt + Shift + E`: the entry that would bring them back is inside the group that just disappeared. Two ways out, and the plan assumes the first:

- **Assumed:** the Edition group is shown whenever the editor is open, and in play mode it holds the mode entry **alone** — Clear and Save are the entries that are edit-only. The group then always offers the way back, and no entry acts on a system the coach is only watching.
- The literal reading: the whole group is hidden in play mode, and `Alt + Shift + E` is the only way back. Rejected at review.

## Decisions

| Decision                                                                | Rejected alternative                                                       | Why                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One `AppMenu` in `src/app/`, with the editor's group passed in          | Two menus — a navigation one in the shell, the editor keeps its own        | Two burgers in the same corner is two things to keep in step, and the editor would be the only page whose menu could not reach the library. One component is one answer to "where do I go?".      |
| The editor's group arrives as a **render prop** `(close) => ReactNode`  | A plain `ReactNode`, or a context the editor writes into                   | Every entry must close the drawer, and only `AppMenu` holds that state. A node cannot be given the callback; a context for one boolean is a provider nobody else reads.                           |
| `dirty` is a prop on `AppMenu`, set by the editor                       | `AppMenu` calling `useDraftContext` itself                                 | `useDraftContext` throws outside its provider, which is every non-editor page. The flag travels down the one path that has it.                                                                    |
| `clearPlay` keeps the play's id, name, court, extent and duration       | Calling `createPlay` again with the same name                              | `createPlay` mints a new `PlayId`, and the draft's origin is matched on that id. Clearing would quietly turn an overwrite into a new row — the coach's saved system left behind, untouched.       |
| Clearing empties the roster too, and leaves the ball at the centre      | Keeping the players and dropping only their movement                       | "Clear everything" is what was asked, and the empty lineup is already what creation offers. A cleared system is exactly a freshly created one, minus the questions.                               |
| The clear confirmation reuses `ConfirmDelete`                           | A bespoke dialog, or `window.confirm`                                      | It is the repo's one dialog for a destructive act, already keyed-per-open and translated. Nothing here is unlike deleting a branch.                                                               |
| The Edition group holds the mode entry in both modes                    | Hiding the whole group in play mode                                        | See the open concern above: otherwise the menu offers no way back from play mode.                                                                                                                 |
| "My systems" is announced disabled with `aria-disabled`, not `disabled` | Mantine's `NavLink disabled`, or hiding the entry                          | `NavLink` keeps `disabled` for styling and never forwards it, so the attribute would not arrive — the save entry already does it this way. Hiding it would leave the coach wondering where it is. |
| "My information" reuses `DisplayNameDialog`                             | A new `/account` screen                                                    | There is one piece of information today, and it already has a dialog. A screen holding one field is a route to maintain for nothing.                                                              |
| `CreateSystemDialog` everywhere, including inside the editor            | Keeping `CreatePlayDialog` for the editor and `CreateSystemDialog` outside | `CreateSystemDialog` already hosts its own throwaway editor context and lands the result at `/play`, which is right from any page. One entry, one dialog, one outcome.                            |
| The burger's dot is the same dot as the save entry's                    | A Mantine `Indicator`, or a count                                          | It says the same thing — there is something to save — and the two are seen together as soon as the drawer opens. The same 8px circle makes that obvious.                                          |
| The account control leaves the header entirely                          | Keeping it beside the language switcher on wide screens                    | It was asked for, and the menu now carries sign in, my information and sign out. Two places to sign out is one too many.                                                                          |

## Global Constraints

- All user-facing strings go through `t('<prefix>.<key>', 'English default')`; the French catalogue is filled in the **same commit**. Prefixes used here: `app.menu.*` (new), plus the existing `play.menu.*`, `play.save.*`, `auth.*`, `home.*`.
- English is the language of code, comments, commit messages and English defaults; French is the `fr` catalogue only.
- Conventional commits, no co-author lines. One commit per task, **proposed to the user and approved before it is made**. The plan file is committed first, as `docs: add plan 008 — Header navigation`.
- `pnpm lint`, `pnpm --filter @phoopers/pwa typecheck`, `pnpm --filter @phoopers/pwa test` and `pnpm --filter @phoopers/pwa i18n:check` all pass before every commit.
- Modals reset by changing `key` on each open, never by a `useState` setter in a `useEffect`.
- Mantine first: `Drawer`, `NavLink`, `Divider`, `Text` as the group headings, `Tooltip` for the disabled entries' reason.
- ~~Nothing in `src/app/` may import from `src/editor/` except types; the dependency runs the other way.~~ Dropped: see "How it came out".

## Review Focus

Input classes no task's happy path exercises. Each has its test placed in the task that owns the code.

- **The app with no Supabase configuration.** Sign in, my systems and my information are all unreachable; the menu must say so rather than offer entries that do nothing, and nothing throws. _(Task 3)_
- **The menu on a page with no editor at all** — the home screen. No Edition group, and no hook that throws outside its provider. _(Task 3)_
- **Clearing a system that came from a saved row.** The id survives, the draft stays dirty, and the next save overwrites rather than inserting. _(Tasks 1 and 4)_
- **Clearing, then cancelling the confirmation.** Nothing changes — not the play, not the selection, not the drawer's state. _(Task 4)_
- **A system open in play mode.** The Edition group holds the mode entry and nothing else. _(Task 4)_

---

### Task 1: `clearPlay`, the mutation

**Files:**

- Modify: `apps/pwa/src/editor/mutations/create.ts`, `apps/pwa/src/editor/mutations/index.ts`
- Test: `apps/pwa/src/editor/mutations/create.test.ts`

**Interfaces:**

- Produces: `clearPlay(play: Play): Play`. (Written as `clearPlay(play, ids)`; see "How it came out".)

- [ ] **Step 1: Write the failing tests**

```ts
it('keeps the system itself and empties what is on the court', () => {
  const before = createPlay({ name: 'Horns', court: 'fiba', extent: 'full', lineup: 'fiveOnFive', duration: 20 }, ids);
  const after = clearPlay(before, { rootBranchId: 'root-2' as BranchId });

  expect(after.id).toBe(before.id);
  expect(after.name).toBe('Horns');
  expect(after.court).toBe('fiba');
  expect(after.extent).toBe('full');
  expect(after.duration).toBe(20);
  expect(after.players).toEqual([]);
  expect(after.branches).toHaveLength(1);
  expect(after.rootBranchId).toBe('root-2');
});

it('leaves one branch holding nothing but the ball', () => {
  // steps, screens and every player track are gone; `tracks.ball` holds a single keyframe at 0.
});

it('drops every variant, not only the ones forked from the root', () => {
  // a play with a branch forked from a branch comes back with one branch.
});
```

- [ ] **Step 2: Implement**

`clearPlay` builds the new root through the same path `createPlay` uses for an empty lineup, so a cleared court and a new one are the same court: the root is named after the play, has no steps, no screens, and `tracks.ball` holding the free spot at the displayed centre. Everything else on the play is carried over unchanged.

- [ ] **Step 3: Verify** — `pnpm --filter @phoopers/pwa test create` green, lint and typecheck clean.

---

### Task 2: `clearPlay` on the editor context

**Files:**

- Modify: `apps/pwa/src/editor/EditorContextProvider.tsx`, `apps/pwa/src/editor/useEditorContext.ts`
- Test: `apps/pwa/src/editor/EditorContextProvider.test.tsx`

**Interfaces:**

- Produces: `EditorContextValue.clearPlay: () => void`, documented beside `createPlay` as "empties the open system without replacing it".

- [ ] **Step 1: Write the failing test** — a harness that clears a play with players and a selection, and asserts the play is empty, its id unchanged, and the selection back to `null` (the selected entity no longer exists; a selection pointing at it would outlive it).

- [ ] **Step 2: Implement** — mint the branch id in the provider, as `createPlay`'s action already does, and clear the selection and any pending screen placement in the same update.

- [ ] **Step 3: Verify** — the editor's test file green, lint and typecheck clean.

---

### Task 3: `AppMenu` — the menu every page wears

**Files:**

- Create: `apps/pwa/src/app/AppMenu.tsx`, `apps/pwa/src/app/appMenu.test.tsx`
- Modify: `apps/pwa/src/home/CreateSystemDialog.tsx` (forward `hideDiscardWarning`)

**Interfaces:**

- Produces: `AppMenu({ editing, dirty }: { editing?: (close: () => void) => ReactNode; dirty?: boolean })`.

The drawer, from the top: the `editing` group when one was passed, then **Navigation** — "Create a new system", "Browse systems", "My systems" — then **Account** — "Sign in" when signed out, "My information" and "Sign out" when signed in. Groups are separated by a `Divider` and headed by a dimmed, uppercase `Text`; the burger carries the same 8px dot as the save entry when `dirty`, with an `aria-label` saying there are unsaved changes.

"My systems" is `aria-disabled` while the session is loading, signed out, or Supabase is unconfigured, with a `Tooltip` giving the reason; the whole Account group is replaced by a single dimmed line when Supabase is unconfigured, since nobody can sign in.

- [ ] **Step 1: Write the failing tests**

```tsx
it('offers the navigation entries on a page with no editor', async () => {
  renderWithProviders(<AppMenu />, { auth: signedOut });
  await user.click(screen.getByRole('button', { name: /menu/i }));
  expect(screen.getByRole('button', { name: /browse systems/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
});

it('offers my systems to nobody until they are signed in', async () => {
  // signed out: the entry is present and `aria-disabled`; signed in: it is not.
});

it('sends a signed-in coach to their systems, and closes', async () => {
  // clicking navigates to /mine and the drawer is gone.
});

it('says nothing about accounts when Supabase is not configured', async () => {
  // no sign-in entry; one dimmed sentence instead.
});

it('wears a dot on the burger when there is something to save', () => {
  // dirty: the burger's accessible name mentions unsaved changes. Not dirty: it does not.
});

it('closes the drawer when the editing group asks it to', async () => {
  // editing={(close) => <button onClick={close}>x</button>}
});
```

- [ ] **Step 2: Implement** — `AppMenu` as described. `CreateSystemDialog` gains a `hideDiscardWarning` pass-through so the editor's instance keeps the warning and the others do not.

- [ ] **Step 3: Verify** — the new test file green; `pnpm --filter @phoopers/pwa test` green.

---

### Task 4: `PlayMenu` becomes the Edition group

**Files:**

- Modify: `apps/pwa/src/editor/PlayMenu.tsx`
- Test: `apps/pwa/src/editor/playMenuKeys.test.tsx`, `apps/pwa/src/editor/savePlay.test.tsx`, `apps/pwa/src/editor/modeShortcut.test.tsx` (existing files, updated to the new shape), plus a new `apps/pwa/src/editor/clearPlay.test.tsx`

**Interfaces:**

- `PlayMenu` keeps its name and its place in `PlayView`'s `leading`, and renders `<AppMenu editing={…} dirty={saving.isDirty} />` plus the dialogs it owns.

The group, in order: the mode entry (both modes, carrying `Alt + Shift + E`), then — in edit mode only — **Clear**, which opens `ConfirmDelete` and on confirm calls `clearPlay`, and **Save**, unchanged, with its dot, its spinner, its tooltip and its `Alt + Shift + S`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('empties the system once the coach confirms', async () => {
  // open the menu, click Clear, confirm: the court has no tokens and the timeline no rows.
});

it('changes nothing when the confirmation is dismissed', async () => {
  // the players are still there, and the menu is still open.
});

it('offers neither clear nor save in play mode, but still offers the way back', async () => {
  // play mode: "Edit mode" is there; "Clear" and "Save" are not.
});
```

Existing tests are updated for the new tree, not weakened: the save shortcut, the save flow and the mode shortcut must all still pass unchanged in behaviour.

- [ ] **Step 2: Implement.**

- [ ] **Step 3: Verify** — the editor suite green.

---

### Task 5: The header itself

**Files:**

- Modify: `apps/pwa/src/app/AppHeader.tsx`, `apps/pwa/src/app/AppShell.tsx`
- Test: `apps/pwa/src/app/appHeader.test.tsx` (new)

- [ ] **Step 1: Write the failing tests** — the header shows no sign-in button and no account button in any auth state; the wordmark is 34px tall; `AppShell` puts the menu ahead of the wordmark.

- [ ] **Step 2: Implement** — delete `AccountControl` and its imports, `h={28}` becomes `h={34}`, `AppShell` passes `leading={<AppMenu />}`. The language switcher stays where it is.

- [ ] **Step 3: Verify** — full suite green, and the home screen's and editor's existing tests still pass.

---

### Task 6: Catalogue, documentation and a look at it

**Files:**

- Modify: `apps/pwa/src/i18n/locales/en/common.json`, `apps/pwa/src/i18n/locales/fr/common.json`, `documentation/plans/index.md`, `documentation/limitations.md` (only if something is knowingly left)
- Modify: `AGENTS.md` status paragraph, if the menu's new home changes what it says

- [ ] **Step 1:** `pnpm --filter @phoopers/pwa extract:i18n`, fill every French value, `pnpm i18n:check`.
- [ ] **Step 2:** Mark plan 008 Implemented in the index; record anything left undone in `limitations.md`.
- [ ] **Step 3:** Run the app and look at the menu on the home screen and in the editor, in both modes, signed in and signed out, at phone width.
