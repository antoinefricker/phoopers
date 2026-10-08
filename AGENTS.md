# AGENTS.md

Web app for creating, saving, and replaying animated basketball plays (2D coach's-whiteboard view + 3D view).

## Status

No code yet — this is an empty scaffold. The full product vision, locked-in design
decisions, and phase plan live in `documentation/roadmap.md`; read it before proposing
features or architecture so you don't re-litigate decisions already made there.

## Project Guidelines

### Before coding

- Always ask the user whether a plan is required before starting non-trivial work.
- When a plan is requested, write it to `documentation/plans/<index>-<DD/MM/YYYY>-<topic>.md` so the user can review it.
- Maintain a list of existing plans in `documentation/plans/index.md`.

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

1. **Always use Mantine** components and hooks — do not use raw HTML or other UI libraries.
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
<Button>{t("admin.members.actions.create", "New member")}</Button>;
```

When adding or changing a UI string:

1. Wrap it with `t('<namespace>.<key>', 'English default')`. Pick the namespace from the existing ones; add a new one only if no existing namespace fits, and update `apps/pwa/src/i18n/resources.ts` to import its JSONs.
2. Run `pnpm --filter @phoopers/pwa extract:i18n`. This regenerates `apps/pwa/src/i18n/locales/<lng>/<ns>.json`. The English file is auto-populated from the second argument; the French file gets an empty string you must fill in.
3. Commit the JSON deltas in the **same commit** as the source change. The `lint-staged` hook re-runs extraction and stages the JSON so this happens by default.

Key naming: `<namespace>.<feature>.<purpose>` — e.g. `admin.members.title`, `admin.members.actions.create`, `cells.types.image`, `common.actions.save`. TypeScript module augmentation in `apps/pwa/src/i18n/i18next.d.ts` types `t()` against the English resources, so unknown keys are a compile error.

Forbidden patterns:

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

- Always explain bash commands succinctly before running them.
