# AGENTS.md

Web app for creating, saving, and replaying animated basketball plays (2D coach's-whiteboard view + 3D view).

## Status

Phases 1a and 1b are implemented. `apps/pwa/src/engine/` is a headless animation engine
answering "where is every player and the ball at time `t`, on a given branch?", and
`apps/pwa/src/play2d/` draws it as a coach's whiteboard: court, paths in their conventional
symbols, animated tokens, a transport with snapping step markers, and a branch tree. The app
renders the sample play in `apps/pwa/src/samples/`. Next is 1c, the editor.

The product vision, locked-in design decisions and phase plan live in
`documentation/roadmap.md`; the validated designs are in `documentation/specs/` and the
implementation plans in `documentation/plans/`. Read the roadmap and the relevant spec
before proposing features or architecture, so you don't re-litigate decisions already made.

## Project Guidelines

### Documentation structure

Everything in `documentation/` is written for the next person who has to change the code —
usually an agent with no memory of why a decision was made. Four artifacts, each with one job:

| Artifact                                         | Holds                                                                | Written when                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`roadmap.md`](documentation/roadmap.md)         | Product vision, the locked-in framing decisions, and the phase order | Once, at the start; amended only when the product direction changes |
| [`specs/`](documentation/specs/index.md)         | The validated design for one sub-project: what the thing IS          | After brainstorming, before any plan                                |
| [`plans/`](documentation/plans/index.md)         | The implementation plan for one spec: task by task, test first       | After the spec is approved, before any code                         |
| [`limitations.md`](documentation/limitations.md) | Every known limitation, defect and coverage gap, by topic            | Continuously, whenever one is found and knowingly left              |

The flow is **roadmap → spec → plan → code**, one sub-project at a time. A phase too large for
one spec is split first (1a, 1b, …), and each piece gets its own full cycle.

**Naming:** `<index>-<DD-MM-YYYY>-<topic>.md` in both `specs/` and `plans/`. The date is the
day the document was written. (The rule below is written `DD/MM/YYYY`; slashes cannot appear
in a filename, so on disk the parts are separated by dashes.) Keep `index.md` in each
folder current, including the Status column — a plan marked "Not started" after it shipped is
worse than no index.

**Specs are declarative.** They describe what the system is, not how the decision was reached.
Rejected alternatives and the argument that produced a design belong in the plan documents and
the git history, not in the spec documents which describe how the engine behaves.

**Plans open with a Decisions section**, so that rationale has a home rather than only a
promise of one. One row per decision that could reasonably have gone the other way: what was
chosen, what was rejected, and why. Alternatives are rejected during brainstorming — two steps
before the plan is written — so carrying them forward is deliberate work, not a by-product.
Without this section the rule above is aspirational. Plans 002 and 003 predate the rule and
were retrofitted — 002 from the spec's first commit, before it was rewritten declaratively,
and 003 from its pull request and commit history, since spec 002 was declarative from the
outset and never held the argument.

**Limitations are centralised, never duplicated.** When a spec or plan needs to mention one,
it states the consequence in a sentence and links to the heading in `limitations.md`. Each
entry there records what the limitation costs **measured**, not estimated, plus why it was not
fixed and how it would be. Delete an entry when it is fixed.

**Linking between markdown files:**

- Relative links work in files in the repo: `[text](../specs/002-….md#heading-anchor)`.
- They do **not** work in PR or issue descriptions — GitHub reads `/pull/documentation/…` as
  its "create a pull request" route and sends the reader to a compare page for a branch that
  does not exist. Use absolute permalinks there: `https://github.com/<owner>/<repo>/blob/<sha>/<path>`.
- Heading anchors are lowercased with punctuation stripped and spaces hyphenated, so an em
  dash surrounded by spaces yields a **double** hyphen, and `` `Step.t` `` becomes `stept`.
  Do not derive them by hand — hover the heading on GitHub for its 🔗, or render the file
  through `gh api -X POST /markdown` and read the generated ids.

### Before coding

- Always ask the user whether a plan is required before starting non-trivial work.
- When a plan is requested, write it to `documentation/plans/<index>-<DD/MM/YYYY>-<topic>.md` so the user can review it.
- Maintain a list of existing plans in `documentation/plans/index.md`.
- A spec gets the same treatment: `documentation/specs/<index>-<DD/MM/YYYY>-<topic>.md`, listed in `documentation/specs/index.md`.

### Commits

- Use conventional commits (e.g. `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Do not add co-author lines to commits.
- Always propose the commit message and wait for user approval before committing.
- When implementing a plan from `documentation/plans/`, split the work into one commit per top-level section of the plan (e.g. a separate commit for the API change, the API tests, etc.) rather than bundling everything into one commit.
- Commit the plan file (and the `index.md` entry) as `docs: add plan NNN — Title` BEFORE the implementation commits, so the plan is visible to anyone bisecting the branch.

### Code Quality

- Always run linter and prettier after editing a file.
- Always run `pnpm lint` before committing to catch unused imports and other issues.

### Testing

#### Mock isolation in vitest

The repo's API test files mock `db()` at module scope and rely on `beforeEach` to reset state. Two pitfalls:

- **Prefer `vi.resetAllMocks()` for new test files** — it clears call history _and_ the `mockResolvedValueOnce` queue, so leftover values can't bleed into the next test. Reserve the `vi.clearAllMocks()` + per-mock `mockReset()` workaround only for files that already use `clearAllMocks` and where switching wholesale would break unrelated tests; in that case `mockReset()` the mocks used with `mockResolvedValueOnce` (typically `mockFirst`, `mockOffset`, `mockReturning`, `mockDel`).
- Test JWT subjects must be valid UUIDs whenever the route validates the corresponding param with `z.uuid()`. Use real UUIDs (e.g. `'11111111-1111-1111-8111-111111111111'`) for `createTestToken`, not fake strings like `'uuid-1'`.

### React Views (PWA)

When creating or editing views in the PWA app:

1. **Reach for Mantine first, but it is a default rather than a cage.** If Mantine has a
   component or hook for what you need, use it. Build custom components by composing Mantine
   primitives, so spacing, colour and dark mode stay consistent without re-deriving them.
   Where Mantine has no good fit — a drawing surface, a bespoke visualisation, a behaviour it
   actively fights — use plain elements or another library rather than contorting around it,
   and keep the result themed through Mantine's CSS variables.
2. **Propose a preview first** — before writing any component code, describe the planned layout, components, and interactions to the user so they can validate the approach.
3. **Only create the content after the user approves** the proposed preview.

### React contexts

When creating or refactoring a React context, follow the `AuthContextProvider` / `useAuthContext` pattern:

- Provider component: `XxxContextProvider` (not `XxxProvider`), in `XxxContextProvider.tsx`.
- Hook: `useXxxContext` (not `useXxx`), co-located with the `XxxContextValue` type and `createContext` call in `useXxxContext.ts` — all three live together, no separate `xxxContextValue.ts` file.
- The hook throws when used outside the provider, with a message naming both `useXxxContext` and `XxxContextProvider`.

### Domain types

- Domain/resource types (server entities like `Play`, …) live in `apps/pwa/src/types/`, one file per entity named after the type (e.g. `types/Team.ts`). Do not define them inline in hooks.

### React 19 strict effects

ESLint's `react-hooks/set-state-in-effect` forbids `useState` setters inside `useEffect`. The "reset modal state on close" pattern (`useEffect(() => { if (!opened) reset(); }, [opened])`) trips it. Two valid fixes:

- **Conditionally render the modal from the parent** (`{opened && <Modal onClose={…} />}`) so each open mounts a fresh component instance. Simplest, but loses Mantine's exit animation since the component unmounts immediately.
- **Keep the modal always rendered** with a `key` prop that changes on each open (e.g. `key={openCount}` where the parent increments `openCount` on every open). Each open swaps the key and remounts the children while preserving the wrapper's open/close transition.

### I18n (PWA)

All user-facing strings in `apps/pwa/src/` go through `react-i18next`'s `t()`. The English value is the source of truth and ships with the call site:

```tsx
const { t } = useTranslation();
<Button>{t('admin.members.actions.create', 'New member')}</Button>;
```

When adding or changing a UI string:

1. Wrap it with `t('<namespace>.<key>', 'English default')`. Pick the namespace from the existing ones; add a new one only if no existing namespace fits, and update `apps/pwa/src/i18n/resources.ts` to import its JSONs.
2. Run `pnpm --filter @phoopers/pwa extract:i18n`. This regenerates `apps/pwa/src/i18n/locales/<lng>/<ns>.json`. The English file is auto-populated from the second argument; the French file gets an empty string you must fill in.
3. Commit the JSON deltas in the **same commit** as the source change. The `lint-staged` hook re-runs extraction and stages the JSON so this happens by default.

Key naming: `<area>.<feature>.<purpose>` — e.g. `admin.members.title`,
`admin.members.actions.create`, `cells.types.image`, `play.transport.play`. Note that the
leading segment is a key PREFIX, not an i18next namespace: `nsSeparator` is `':'`, so
`t('play.transport.play')` resolves inside the default `common` namespace and lands in
`common.json`. A genuine second namespace needs the `t('ns:key')` form AND an entry in
`resources.ts`; today the app has one namespace and prefixes keys by area, which is simpler
and is what `pnpm i18n:check` enforces. TypeScript module augmentation in `apps/pwa/src/i18n/i18next.d.ts` types `t()` against the
English resources — but **only for the single-argument form** `t('play.transport.play')`. The
two-argument form this project mandates, `t('play.transport.play', 'Play')`, accepts any key by
design: supplying a default value tells i18next the key need not exist yet. A mistyped key
is therefore **not** a compile error. It is caught by `pnpm i18n:check`, which compares the
keys the source references against the committed catalogue and fails on a key that is
missing, orphaned (the typo's victim), or in a namespace `resources.ts` never imports.
Extraction is non-destructive (`keepRemoved: true`), so a typo never silently deletes the
mistyped key's existing translations.

Forbidden patterns, enforced by `i18next/no-literal-string` in `eslint.config.js`:

- Hard-coded user-facing strings in JSX or component props (`label`, `placeholder`, `description`, `title`, `aria-label`, etc.).
- Hard-coded date formats. Use `printDate` / `printDateTime` from `apps/pwa/src/utils/renderer/dateRenderer.ts`; dayjs and Mantine's `DatesProvider` both follow `i18n.language` via subscribers in `apps/pwa/src/i18n/i18n.ts`.

Adding a new locale: register it in `SUPPORTED_LOCALES` (`apps/pwa/src/i18n/i18n.ts`), add it to `apps/pwa/i18next-parser.config.ts`'s `locales`, run extraction, translate, and surface it in `LanguageSwitcher`.

### Pull Requests

- Do not create a PR unless the user explicitly asks for it.
- Do not add Claude co-authoring or attribution in the PR description.
- When creating a PR, generate a summary section and a test plan section formatted as a todo checklist. Leave all test plan items unchecked.
- Before writing the PR body, run the test suite and record the current test instrumentation in the summary: total tests passing (e.g. `308 passing`) and how many tests this PR adds, so reviewers can see how coverage moved.

### Makefile

- When creating or editing a Makefile command, always update the Makefile documentation in `README.md` to reflect the change.

### Communication

- **Everything written around the code is in English.** This covers the README, everything
  in `documentation/`, commit messages, branch names, pull request titles and descriptions,
  code comments, identifiers, user-facing strings' English defaults, and this file. One
  language in the repository means any contributor can read all of it, and it keeps the
  history searchable with a single vocabulary.
  The exception is translation content: the French catalogue under
  `apps/pwa/src/i18n/locales/fr/` is French by definition.
  This rule is about the artifacts, not the conversation — chat with the user happens in
  whichever language they write in.
- Always explain bash commands succinctly before running them.
