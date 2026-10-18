# Accounts and persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach signs in with Google, saves a system to Supabase, finds it in a list after a reload, reopens it, and can publish it at an address anyone may read.

**Architecture:** The app stops being one screen. React Router gives it `/`, `/library`, `/mine`, `/play`, `/play/:id`, `/signin` and `/auth/callback`; TanStack Query owns everything read from the server; a Supabase client built from Vite environment variables — and `null` when they are absent — is the single door to the network. A `Play` travels to Postgres as one `jsonb` document with its list-facing fields copied into columns, and Row Level Security, not the interface, decides who may read and write it. The system being edited is mirrored into `localStorage` on every change, which is what makes the Google round trip and any reload safe.

**Tech Stack:** React 19, TypeScript, Mantine 9, React Router 7, TanStack Query 5, `@supabase/supabase-js` 2, Vitest, react-i18next.

**Spec:** [documentation/specs/006-18-10-2026-accounts-and-persistence.md](../specs/006-18-10-2026-accounts-and-persistence.md)

## Decisions

| Decision                                                                   | Rejected alternative                                                | Why                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The whole `Play` in one `jsonb` column, list fields copied into columns    | A table per entity (players, branches, keyframes, steps)            | The engine resolves a branch against the entire tree; no screen reads part of a system. Tables would buy queries nobody runs and cost a join-heavy write on every save.        |
| `Play.id` is the row's primary key, minted by the client                   | A database-generated row id, document id ignored                    | One identity for the address, the draft and the document. A generated id would let a draft and its row disagree about what is open.                                            |
| `getSupabaseClient()` returns `null` when unconfigured, and never throws   | Throwing at import, or a stub client that fails every call          | The editor and the draft must work with no project at all — that is the state the test suite and CI run in. A null is checkable; a throwing import takes the whole app down.   |
| Supabase is faked in tests by a hand-written client double                 | `msw`, or a real local Postgres in CI                               | The API module touches six query shapes, all of them chainable builders; a double for those is fifty lines and no new dev dependency, and CI gains no database service.        |
| Dirtiness from a **fingerprint** of the saved document, not a deep compare | Keeping the saved `Play` in memory and comparing it on render       | The comparison runs on every edit; a cheap string hash costs nothing and the draft in `localStorage` stays one copy of the system rather than two.                             |
| The draft is one record under one key, holding the play and its origin     | One entry per system, or a session-scoped copy                      | The spec says exactly one system is held. The origin travels with it, so resuming a stored system writes back to its row instead of creating a second copy.                    |
| A separate `DraftContextProvider` inside the editor context                | Adding origin, dirtiness and persistence to `EditorContextProvider` | `EditorContextProvider` already carries twenty mutations. Where a system came from and whether it is saved is a different responsibility, and the editor is usable without it. |
| A `/signin` route rather than a modal                                      | A sign-in dialog over whatever screen asked for it                  | The redirect leaves the page; a modal's caller would have to be rebuilt on return. A route is a place the callback can land, and `?next=` carries where to go back to.         |
| Search filters in Postgres with `ilike`                                    | Filtering the fetched list in the browser                           | The query is already paged by the server, and `ilike` keeps the two lists honest when the library outgrows one page. Accents are left as Postgres compares them.               |
| No pagination control in this lot; a fixed ceiling per list                | Infinite scroll or numbered pages                                   | Nobody owns fifty systems yet. A ceiling is one line and is visible in the query, where a later lot replaces it.                                                               |

## Global Constraints

- All user-facing strings go through `t('<prefix>.<key>', 'English default')`; the French catalogue is filled in the **same commit**. New prefixes: `home.*`, `auth.*`, `library.*`, `mine.*`, `play.save.*`.
- English is the language of code, comments, commit messages and English defaults; French is the `fr` catalogue only.
- Conventional commits, no co-author lines. One commit per task, **proposed to the user and approved before it is made**.
- `pnpm lint`, `pnpm --filter @phoopers/pwa typecheck`, `pnpm --filter @phoopers/pwa test` and `pnpm --filter @phoopers/pwa i18n:check` all pass before every commit.
- No test reaches a real database, and no test needs `VITE_SUPABASE_URL` to be set.
- No key, URL or token is committed. `.env.local` is ignored; `.env.example` is committed.
- Domain types live one per file in `apps/pwa/src/types/`, named after the type.
- Contexts follow `XxxContextProvider` / `useXxxContext`, the hook throwing outside the provider and naming both.
- Modals reset by changing `key` on each open, never by a `useState` setter in a `useEffect`.

## Review Focus

Input classes the spec implies that no task's happy path exercises. Each has its test placed in the task that owns the code.

- **The app with no Supabase configuration at all.** Every screen that needs the server says so; nothing throws, and the editor still works. _(Tasks 1, 8, 11)_
- **A draft in `localStorage` that cannot be parsed, or that holds something that is not a play.** It must read as "no draft", not crash the home screen on its first paint. _(Task 6)_
- **`/play/:id` naming a system that is private or absent.** The same screen either way, and it must not say which. _(Task 13)_
- **Saving a system owned by someone else.** The original row must be untouched, and the copy must carry a new id and be private. _(Task 14)_
- **A name of nothing but spaces** in the save and rename dialogs, as the creation dialog already refuses. _(Tasks 11, 14)_

---

### Task 1: Configuration, the client, and the schema

**Files:**

- Create: `apps/pwa/src/supabase/client.ts`, `apps/pwa/.env.example`, `supabase/migrations/0001_plays_and_profiles.sql`
- Modify: `apps/pwa/.gitignore` or root `.gitignore` (add `.env.local`), `README.md` (a "Supabase" section), `apps/pwa/package.json` (add `@supabase/supabase-js`)
- Test: `apps/pwa/src/supabase/client.test.ts`

**Interfaces:**

- Produces: `getSupabaseClient(): SupabaseClient | null`, `isSupabaseConfigured(): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
it('is not configured when the environment is empty', () => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  expect(isSupabaseConfigured()).toBe(false);
  expect(getSupabaseClient()).toBeNull();
});
it('builds one client, once, when both variables are set', () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  expect(getSupabaseClient()).toBe(getSupabaseClient());
});
it('is not configured when only one of the two is set', () => { … });
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm --filter @phoopers/pwa test src/supabase/client.test.ts`, expected FAIL on the missing module.

- [ ] **Step 3: Install `@supabase/supabase-js` and implement the module**

The client is memoised per resolved configuration, created with `createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } })`. Reading `import.meta.env` happens inside the functions, not at module scope, so `vi.stubEnv` can reach it.

- [ ] **Step 4: Write the migration**

`supabase/migrations/0001_plays_and_profiles.sql` creates:

- `profiles(id uuid primary key references auth.users on delete cascade, display_name text not null, created_at timestamptz not null default now())`
- `plays(id uuid primary key, owner_id uuid not null references auth.users on delete cascade, name text not null, court text not null, extent text not null, is_public boolean not null default false, schema_version int not null default 1, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`, with an index on `(owner_id, updated_at desc)` and one on `(is_public, updated_at desc)`.
- `alter table … enable row level security` on both, then the policies of the spec: profiles readable by all and written by `auth.uid() = id`; plays readable when `is_public or owner_id = auth.uid()`, inserted with `owner_id = auth.uid()`, updated and deleted by the owner.
- A trigger setting `updated_at = now()` on update.

- [ ] **Step 5: Write `.env.example` and the README section**

`.env.example` names both variables with empty values and a comment saying the anon key is public but still not committed. README gains "Supabase": create a project, enable Google as a provider, run the migration in the SQL editor, copy both values into `apps/pwa/.env.local`. Update the Makefile documentation if a target is added.

- [ ] **Step 6: Run the tests and the lint** — all green, `pnpm lint` clean.

- [ ] **Step 7: Commit** — `feat: add the Supabase client, schema and configuration`

---

### Task 2: The row ⇄ document serialization

**Files:**

- Create: `apps/pwa/src/types/StoredPlay.ts`, `apps/pwa/src/types/PlaySummary.ts`, `apps/pwa/src/plays/serialize.ts`
- Test: `apps/pwa/src/plays/serialize.test.ts`

**Interfaces:**

- Produces:
  - `PLAY_SCHEMA_VERSION = 1`
  - `interface StoredPlay { id: PlayId; ownerId: string; isPublic: boolean; updatedAt: string; play: Play }`
  - `interface PlaySummary { id: PlayId; name: string; court: Play['court']; extent: CourtExtent; isPublic: boolean; updatedAt: string; ownerId: string; authorName?: string }`
  - `interface PlayRow { … }` — the database shape, snake_case
  - `toRow(play: Play, options: { ownerId: string; isPublic: boolean }): PlayRow`
  - `fromRow(row: PlayRow): StoredPlay`
  - `summaryFromRow(row: Omit<PlayRow, 'data'> & { profiles?: { display_name: string } | null }): PlaySummary`

- [ ] **Step 1: Write the failing tests**

```ts
it('copies the list fields out of the document', () => {
  const row = toRow(halfCourtPlay, { ownerId: 'owner-1', isPublic: true });
  expect(row).toMatchObject({ id: halfCourtPlay.id, name: halfCourtPlay.name, court: 'fiba', extent: 'half', is_public: true, owner_id: 'owner-1', schema_version: 1 });
});
it('defaults the extent column to full when the document does not say', () => { … expect(row.extent).toBe('full') });
it('round-trips a play through a row unchanged', () => {
  expect(fromRow(toRow(hornsPlay, { ownerId: 'o', isPublic: false })).play).toEqual(hornsPlay);
});
it('takes the document as authoritative when a column disagrees with it', () => {
  const row = { ...toRow(hornsPlay, { ownerId: 'o', isPublic: false }), name: 'stale' };
  expect(fromRow(row).play.name).toBe(hornsPlay.name);
});
it('reads a document whose schema version it does not know', () => {
  expect(fromRow({ ...row, schema_version: 99 }).play).toEqual(hornsPlay);
});
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement the three functions.** `extentOf` from the engine supplies the extent column. `fromRow` casts `row.data` to `Play` without validating: the editor's existing issue panel is what reports a bad document.

- [ ] **Step 4: Run the tests — green.**

- [ ] **Step 5: Commit** — `feat: serialize a play to and from its database row`

---

### Task 3: The plays API

**Files:**

- Create: `apps/pwa/src/plays/playsApi.ts`, `apps/pwa/src/plays/testUtils/fakeSupabase.ts`
- Test: `apps/pwa/src/plays/playsApi.test.ts`

**Interfaces:**

- Consumes: `getSupabaseClient` (Task 1), `toRow` / `fromRow` / `summaryFromRow` (Task 2).
- Produces, each rejecting with `new Error('supabase-not-configured')` when there is no client:
  - `listMyPlays(search?: string): Promise<PlaySummary[]>`
  - `listPublicPlays(search?: string): Promise<PlaySummary[]>`
  - `fetchPlay(id: PlayId): Promise<StoredPlay | null>` — `null` when the row is absent or unreadable
  - `insertPlay(play: Play, options: { ownerId: string; isPublic: boolean }): Promise<StoredPlay>`
  - `updatePlay(play: Play): Promise<StoredPlay>`
  - `renamePlay(id: PlayId, name: string): Promise<void>`
  - `setPlayVisibility(id: PlayId, isPublic: boolean): Promise<void>`
  - `deletePlay(id: PlayId): Promise<void>`
- `fakeSupabase.ts` produces `fakeSupabaseClient(rows: PlayRow[])`, a chainable double recording the calls made against it, with `installFakeSupabase()` mocking `../supabase/client`.

- [ ] **Step 1: Write the failing tests**

```ts
it('asks for the signed-in coach’s systems, newest first', async () => {
  await listMyPlays();
  expect(fake.calls).toContainEqual({ from: 'plays', order: ['updated_at', { ascending: false }] });
});
it('filters by name when a search is given', async () => {
  await listMyPlays('horns');
  expect(fake.calls).toContainEqual({ from: 'plays', ilike: ['name', '%horns%'] });
});
it('asks the library for public systems and their authors', async () => { … expect select to include the joined profile … });
it('returns null for a system the reader may not read', async () => {
  expect(await fetchPlay(missingId)).toBeNull();
});
it('refuses every call when Supabase is not configured', async () => {
  await expect(listMyPlays()).rejects.toThrow('supabase-not-configured');
});
it('writes the whole document on an update', async () => { … expect(fake.calls).toContainEqual({ from: 'plays', update: expect.objectContaining({ data: edited }) }) });
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Write the double, then the API.** The double implements only `from`, `select`, `eq`, `ilike`, `order`, `limit`, `maybeSingle`, `insert`, `update`, `delete` and `single`, each returning the builder and the terminal ones a `{ data, error }`. `LIST_LIMIT = 100` is where pagination will go.

- [ ] **Step 4: Run the tests — green.**

- [ ] **Step 5: Commit** — `feat: read and write plays through Supabase`

---

### Task 4: Accounts and profiles

**Files:**

- Create: `apps/pwa/src/types/Profile.ts`, `apps/pwa/src/auth/profileApi.ts`, `apps/pwa/src/auth/AuthContextProvider.tsx`, `apps/pwa/src/auth/useAuthContext.ts`
- Test: `apps/pwa/src/auth/profileApi.test.ts`, `apps/pwa/src/auth/authContext.test.tsx`

**Interfaces:**

- Consumes: `getSupabaseClient`, the fake from Task 3.
- Produces:
  - `interface Profile { id: string; displayName: string }`
  - `fetchProfile(userId: string): Promise<Profile | null>`, `saveDisplayName(userId: string, displayName: string): Promise<Profile>`
  - `AuthContextProvider`, and `useAuthContext(): { status: 'loading' | 'signedOut' | 'signedIn'; userId: string | null; configured: boolean; signInWithGoogle: (next: string) => Promise<void>; signOut: () => Promise<void> }`
  - `signInWithGoogle` calls `signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback?next=<next> } })`.

- [ ] **Step 1: Write the failing tests**

```ts
it('is signed out, and not configured, with no Supabase project', () => { … expect(status).toBe('signedOut'); expect(configured).toBe(false) });
it('reports the signed-in user id once the session resolves', async () => { … });
it('follows the session out when the coach signs out', async () => { … });
it('names the callback address, carrying where to return to', async () => {
  await signInWithGoogle('/play');
  expect(fake.auth.calls.signInWithOAuth[0].options.redirectTo).toContain('/auth/callback?next=%2Fplay');
});
it('throws outside its provider, naming both names', () => {
  expect(() => renderHook(useAuthContext)).toThrow(/useAuthContext.*AuthContextProvider/s);
});
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.** The provider subscribes with `onAuthStateChange` and unsubscribes on unmount; with no client it settles straight to `signedOut` with `configured: false`.

- [ ] **Step 4: Run the tests — green.**

- [ ] **Step 5: Commit** — `feat: hold the signed-in coach in an auth context`

---

### Task 5: Server state through TanStack Query

**Files:**

- Create: `apps/pwa/src/app/QueryProvider.tsx`, `apps/pwa/src/plays/usePlays.ts`, `apps/pwa/src/auth/useProfile.ts`
- Modify: `apps/pwa/package.json` (add `@tanstack/react-query`)
- Test: `apps/pwa/src/plays/usePlays.test.tsx`

**Interfaces:**

- Consumes: the API of Tasks 3 and 4.
- Produces: `playKeys = { mine: (search) => […], public: (search) => […], one: (id) => […] }`; hooks `useMyPlays(search)`, `usePublicPlays(search)`, `useStoredPlay(id)`, `useProfile()`; mutations `useSavePlay()`, `useRenamePlay()`, `useSetVisibility()`, `useDeletePlay()`, `useSaveDisplayName()`. Every mutation invalidates `playKeys.mine()` and, when visibility is involved, `playKeys.public()`.
- `QueryProvider` creates one `QueryClient` with `retry: false` and wraps its children.

- [ ] **Step 1: Write the failing tests** — a list hook returns what the API returned; a rename mutation invalidates `mine` and leaves `public` alone unless visibility changed; a mutation's failure surfaces as `isError` rather than throwing.

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Install `@tanstack/react-query` and implement the hooks.**

- [ ] **Step 4: Run the tests — green.**

- [ ] **Step 5: Commit** — `feat: read server state through TanStack Query`

---

### Task 6: The draft in the browser

**Files:**

- Create: `apps/pwa/src/draft/draftStorage.ts`
- Test: `apps/pwa/src/draft/draftStorage.test.ts`

**Interfaces:**

- Produces:
  - `interface DraftOrigin { ownerId: string; isPublic: boolean; fingerprint: string }`
  - `interface Draft { play: Play; origin: DraftOrigin | null }`
  - `fingerprint(play: Play): string` — a stable hash of `JSON.stringify(play)`
  - `readDraft(): Draft | null`, `writeDraft(draft: Draft): void`, `clearDraft(): void`
  - `DRAFT_KEY = 'phoopers.draft.v1'`

- [ ] **Step 1: Write the failing tests**

```ts
it('gives back what was written', () => { writeDraft(draft); expect(readDraft()).toEqual(draft) });
it('reads as no draft when the key holds something that is not JSON', () => {
  localStorage.setItem(DRAFT_KEY, '{oops');
  expect(readDraft()).toBeNull();
});
it('reads as no draft when the stored value is not a play', () => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ play: { id: 'x' }, origin: null }));
  expect(readDraft()).toBeNull();
});
it('survives storage being unavailable', () => { /* setItem throws */ expect(() => writeDraft(draft)).not.toThrow() });
it('changes the fingerprint when anything in the play changes', () => { … });
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.** A draft is accepted only when `play.id`, `play.rootBranchId` and an array of `branches` are present; anything else is `null`. Every read and write is wrapped against a throwing `localStorage`.

- [ ] **Step 4: Run the tests — green.**

- [ ] **Step 5: Commit** — `feat: keep the system being edited in the browser`

---

### Task 7: The draft context

**Files:**

- Create: `apps/pwa/src/draft/DraftContextProvider.tsx`, `apps/pwa/src/draft/useDraftContext.ts`
- Test: `apps/pwa/src/draft/draftContext.test.tsx`

**Interfaces:**

- Consumes: `useEditorContext().play`, Task 6's storage.
- Produces: `useDraftContext(): { origin: DraftOrigin | null; isDirty: boolean; markSaved: (origin: DraftOrigin) => void; discard: () => void }`. The provider takes `initialOrigin: DraftOrigin | null` and writes the draft whenever the play changes.

- [ ] **Step 1: Write the failing tests**

```ts
it('writes the open system to storage on every edit', async () => { … expect(readDraft()?.play).toEqual(editedPlay) });
it('is dirty from the start for a system that was never stored', () => expect(isDirty).toBe(true));
it('is clean for a stored system nobody has touched', () => expect(isDirty).toBe(false));
it('is dirty again after one edit, and clean again once marked saved', async () => { … });
it('throws outside its provider, naming both names', () => { … });
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.** The write happens in an effect keyed on the play, which is the one legitimate effect here: it touches storage, not state.

- [ ] **Step 4: Run the tests — green.**

- [ ] **Step 5: Commit** — `feat: track where the open system came from and whether it is saved`

---

### Task 8: Routes, the shell, and the home screen

**Files:**

- Create: `apps/pwa/src/app/AppRoutes.tsx`, `apps/pwa/src/app/AppShell.tsx`, `apps/pwa/src/home/HomeScreen.tsx`
- Modify: `apps/pwa/src/App.tsx`, `apps/pwa/src/App.test.tsx`, `apps/pwa/package.json` (add `react-router`)
- Test: `apps/pwa/src/home/homeScreen.test.tsx`

**Interfaces:**

- Consumes: `AuthContextProvider`, `QueryProvider`, `readDraft`.
- Produces: `App` = `QueryProvider` → `AuthContextProvider` → `BrowserRouter` → `AppRoutes`; routes `/`, `/library`, `/mine`, `/play`, `/play/:id`, `/signin`, `/auth/callback`, and a catch-all redirecting to `/`.
- `AppShell` renders the app name, the `LanguageSwitcher`, and on the right either a "Sign in" link or a menu holding the display name and "Sign out". The "Change my display name" entry joins that menu in Task 10, with the dialog it opens.

- [ ] **Step 1: Write the failing tests**

```ts
it('opens on the home screen, not on the sample play', () => {
  renderApp();
  expect(screen.getByRole('heading', { name: 'phoopers' })).toBeInTheDocument();
  expect(screen.queryByTestId('token')).not.toBeInTheDocument();
});
it('offers the three doors', () => { ['New system', 'Public systems', 'My systems'].forEach(…) });
it('invites signing in on My systems when nobody is signed in', async () => { … });
it('says the app is not configured, and still offers New system, with no Supabase project', () => { … });
it('reaches the editor from New system when there is no draft', async () => { … expect(location.pathname).toBe('/play') });
```

The existing `App.test.tsx` assertion that the app boots on `hornsPlay` is **replaced**, not kept: that behaviour is what this lot removes.

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Install `react-router` and implement the shell, the routes and the three cards.** Three Mantine `Card`s of equal rank in a responsive `SimpleGrid`; none is `variant="filled"`.

- [ ] **Step 4: Extract the strings, fill the French catalogue, run `extract:i18n` and `i18n:check`.**

- [ ] **Step 5: Run the tests — green.**

- [ ] **Step 6: Commit** — `feat: open the app on a home screen with real addresses`

---

### Task 9: Resuming the draft

**Files:**

- Create: `apps/pwa/src/home/ResumeDraftDialog.tsx`
- Modify: `apps/pwa/src/home/HomeScreen.tsx`
- Test: `apps/pwa/src/home/resumeDraft.test.tsx`

**Interfaces:**

- Consumes: `readDraft`, `clearDraft`.
- Produces: a dialog with the draft's name in its body and two actions — "Resume" (navigates to `/play`, keeping the draft) and "Start a new one" (clears the draft, then opens the creation dialog).

- [ ] **Step 1: Write the failing tests** — with a draft, "New system" opens the dialog naming the draft; "Resume" lands on `/play` with the draft intact; "Start a new one" clears it and shows the creation dialog; with no draft, "New system" goes straight to the creation dialog.

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement**, the dialog mounted always with a `key` that changes on each open.

- [ ] **Step 4: Strings, extraction, catalogue.**

- [ ] **Step 5: Run the tests — green.**

- [ ] **Step 6: Commit** — `feat: offer the system in progress back before starting a new one`

---

### Task 10: Signing in

**Files:**

- Create: `apps/pwa/src/auth/SignInScreen.tsx`, `apps/pwa/src/auth/AuthCallbackScreen.tsx`, `apps/pwa/src/auth/DisplayNameDialog.tsx`
- Modify: `apps/pwa/src/app/AppRoutes.tsx`
- Test: `apps/pwa/src/auth/signIn.test.tsx`

**Interfaces:**

- Consumes: `useAuthContext`, `useProfile`, `useSaveDisplayName`.
- Produces: `/signin` reading `?next=`; `/auth/callback` which waits for the session, asks for a display name when the profile is missing, and then navigates to `next` (defaulting to `/`); and the "Change my display name" entry in `AppShell`'s account menu, which opens the same dialog.

- [ ] **Step 1: Write the failing tests**

```ts
it('offers one way in', () => { expect(screen.getAllByRole('button', { name: /Continue with/ })).toHaveLength(1) });
it('carries where to come back to through the provider', async () => { … });
it('asks for a display name on the first return, before going anywhere', async () => { … });
it('refuses a display name of nothing but spaces', async () => { … });
it('goes where the coach was once the name is given', async () => { … expect(location.pathname).toBe('/play') });
it('says the app is not configured rather than offering a dead button', () => { … });
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Strings, extraction, catalogue.**

- [ ] **Step 5: Run the tests — green.**

- [ ] **Step 6: Commit** — `feat: sign in with Google and name yourself once`

---

### Task 11: My systems

**Files:**

- Create: `apps/pwa/src/mine/MyPlaysScreen.tsx`, `apps/pwa/src/mine/PlayCard.tsx`, `apps/pwa/src/mine/RenamePlayDialog.tsx`
- Modify: `apps/pwa/src/app/AppRoutes.tsx`
- Test: `apps/pwa/src/mine/myPlays.test.tsx`

**Interfaces:**

- Consumes: `useMyPlays`, `useRenamePlay`, `useSetVisibility`, `useDeletePlay`, `useSavePlay` (for Duplicate), `ConfirmDelete`.
- Produces: `PlayCard` with props `{ summary: PlaySummary; actions?: ReactNode; onOpen: () => void }`, shared with Task 12.

- [ ] **Step 1: Write the failing tests**

```ts
it('lists the coach’s systems with their court, extent and badge', async () => { … });
it('keeps every action but Open behind one menu', async () => {
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'More actions for Horns flare' }));
  ['Rename', 'Make public', 'Duplicate', 'Delete'].forEach((name) => expect(screen.getByRole('menuitem', { name })).toBeInTheDocument());
});
it('asks before deleting, and deletes only on confirmation', async () => { … });
it('refuses a rename to nothing but spaces', async () => { … });
it('duplicates as a private copy with a new id', async () => { … });
it('searches by name', async () => { … expect(useMyPlays called with 'horns') });
it('says to sign in rather than listing nothing when signed out', async () => { … });
it('says the app is not configured rather than failing with no project', async () => { … });
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.** Search is debounced into the query key; the `…` menu is a Mantine `Menu` whose trigger's accessible name carries the system's name.

- [ ] **Step 4: Strings, extraction, catalogue.**

- [ ] **Step 5: Run the tests — green.**

- [ ] **Step 6: Commit** — `feat: list, rename, publish, duplicate and delete my systems`

---

### Task 12: The public library

**Files:**

- Create: `apps/pwa/src/library/LibraryScreen.tsx`
- Modify: `apps/pwa/src/app/AppRoutes.tsx`
- Test: `apps/pwa/src/library/library.test.tsx`

**Interfaces:**

- Consumes: `usePublicPlays`, `PlayCard` from Task 11.

- [ ] **Step 1: Write the failing tests** — the cards carry the author's display name and no ownership actions; the list is reachable signed out; the search reaches the query; an empty library says so.

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Strings, extraction, catalogue.**

- [ ] **Step 5: Run the tests — green.**

- [ ] **Step 6: Commit** — `feat: browse the public library`

---

### Task 13: The editor routes

**Files:**

- Create: `apps/pwa/src/play2d/EditorRoute.tsx`, `apps/pwa/src/play2d/NoSuchPlayScreen.tsx`, `apps/pwa/src/mine/LeaveDraftDialog.tsx`
- Modify: `apps/pwa/src/app/AppRoutes.tsx`, `apps/pwa/src/mine/MyPlaysScreen.tsx`, `apps/pwa/src/library/LibraryScreen.tsx`
- Test: `apps/pwa/src/play2d/editorRoute.test.tsx`

**Interfaces:**

- Consumes: `useStoredPlay`, `readDraft`, `useDraftContext`, `EditorContextProvider`, `PlayView`.
- Produces: `/play` renders the draft, or redirects to `/` when there is none; `/play/:id` fetches, then renders `EditorContextProvider` + `DraftContextProvider` + `PlayView`, keyed on the id. Opening a system from either list goes through `LeaveDraftDialog` when the held draft is dirty.

- [ ] **Step 1: Write the failing tests**

```ts
it('edits the draft at /play', async () => { … });
it('sends an empty /play back to the home screen', () => { … });
it('opens a stored system at its own address', async () => { … });
it('says the same thing for a private system and for one that does not exist', async () => {
  expect(await screen.findByText('No such system')).toBeInTheDocument();
  expect(screen.queryByText(/private/i)).not.toBeInTheDocument();
});
it('invites signing in on that screen when nobody is', async () => { … });
it('warns before replacing a draft with unsaved changes, and only then opens', async () => { … });
it('switches without a word when the draft is clean', async () => { … });
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Strings, extraction, catalogue.**

- [ ] **Step 5: Run the tests — green.**

- [ ] **Step 6: Commit** — `feat: open a stored system at its own address`

---

### Task 14: Saving

**Files:**

- Create: `apps/pwa/src/editor/SavePlayDialog.tsx`
- Modify: `apps/pwa/src/editor/PlayMenu.tsx`
- Test: `apps/pwa/src/editor/savePlay.test.tsx`

**Interfaces:**

- Consumes: `useDraftContext`, `useAuthContext`, `useSavePlay`, `useProfile`.
- Produces: the "Save" entry enabled, carrying a mark while `isDirty`; `SavePlayDialog` with the name (editable, trimmed, refused when empty) and a public/private choice, which on submit inserts and calls `markSaved`.

- [ ] **Step 1: Write the failing tests**

```ts
it('marks Save while the open system differs from what is stored', async () => { … });
it('sends a coach with no account to sign in, and comes back to the save dialog', async () => { … });
it('inserts through the dialog on a first save, then stops marking Save', async () => { … });
it('overwrites without a dialog when the signer owns the system', async () => { … });
it('offers a copy, and leaves the original alone, when someone else owns it', async () => {
  await save();
  expect(updatePlay).not.toHaveBeenCalled();
  expect(insertPlay).toHaveBeenCalledWith(expect.objectContaining({ id: expect.not.stringMatching(original.id) }), { ownerId: 'me', isPublic: false });
});
it('refuses a name of nothing but spaces', async () => { … });
it('keeps the draft and says so when the save fails', async () => { … });
```

- [ ] **Step 2: Run them and watch them fail.**

- [ ] **Step 3: Implement.** A copy mints a new `PlayId` and rewrites `play.id`; the dialog opens with the original's name followed by the copy marker from the catalogue.

- [ ] **Step 4: Strings, extraction, catalogue** — the `play.menu.saveSoon` tooltip goes away with the disabled entry.

- [ ] **Step 5: Run the tests — green.**

- [ ] **Step 6: Commit** — `feat: save a system, overwrite it, or copy someone else's`

---

### Task 15: The documentation sweep

**Files:**

- Modify: `documentation/specs/index.md`, `documentation/plans/index.md`, `documentation/limitations.md`, `AGENTS.md` (the Status paragraph), `documentation/roadmap.md` (the "Next steps" list), `README.md`

- [ ] **Step 1: Add spec 006 and plan 007 to both indexes**, Status "Implemented".

- [ ] **Step 2: Update the Status paragraph in `AGENTS.md`** — 1d is complete; phase 2 (3D) is next and needs its own spec.

- [ ] **Step 3: Rewrite the limitation**
      [A system's court, extent and duration are fixed](../limitations.md#a-systems-court-extent-and-duration-are-fixed-once-it-is-created): the name is now editable; the court, extent and duration are not.

- [ ] **Step 4: Record the new limitations this lot knowingly leaves** — no automated test covers the RLS policies, the lists have a fixed ceiling and no pagination, two tabs holding one system overwrite each other, and the app is not deployed so a public address is shareable only on localhost. Each with what it costs and how it would be fixed.

- [ ] **Step 5: Run the whole suite, the lint, the typecheck and `i18n:check`** — all green.

- [ ] **Step 6: Commit** — `docs: record accounts and persistence as shipped`
