# Phoopers

Create, save, and replay animated basketball plays — a 2D coach's-whiteboard view today,
a 3D view later. See [documentation/roadmap.md](documentation/roadmap.md) for the product
vision and phasing.

## Requirements

- Node 24 (see `.nvmrc` — `nvm use` picks it up)
- pnpm 10.8.0 (`corepack enable` installs the pinned version)

## Getting started

```bash
pnpm install
pnpm --filter @phoopers/pwa dev
```

The app is served at http://localhost:5173.

## Scripts

Run from the repository root; each one fans out to every workspace.

| Script            | What it does                                    |
| ----------------- | ----------------------------------------------- |
| `pnpm lint`       | ESLint across the repo, then `prettier --check` |
| `pnpm lint:fix`   | ESLint `--fix`, then `prettier --write`         |
| `pnpm format`     | Prettier `--write` only                         |
| `pnpm typecheck`  | `tsc --noEmit` in every workspace               |
| `pnpm test`       | Vitest, run once (no watch)                     |
| `pnpm i18n:check` | Fail if the locale catalogue is out of date     |
| `pnpm build`      | Production build of every workspace             |

Workspace-specific:

| Script                                     | What it does                               |
| ------------------------------------------ | ------------------------------------------ |
| `pnpm --filter @phoopers/pwa dev`          | Vite dev server                            |
| `pnpm --filter @phoopers/pwa extract:i18n` | Regenerate `src/i18n/locales/*` from `t()` |

## Workspace layout

```
apps/pwa        @phoopers/pwa — Vite + React 19 + Mantine front end
documentation   roadmap and implementation plans
```

## Quality gates

A Husky `pre-commit` hook runs `lint-staged`: ESLint `--fix` and Prettier on staged
source files, plus i18n extraction for anything under `apps/pwa/src`. The same checks
run in CI (`.github/workflows/ci.yml`) on every push and pull request, as a single
sequential job: lint → typecheck → i18n:check → test → build.

### A note on translation keys

TypeScript module augmentation in `apps/pwa/src/i18n/i18next.d.ts` constrains `t()` to
known keys — but only for the single-argument form `t('app.title')`. The two-argument
form this project uses everywhere, `t('app.title', 'Phoopers')`, accepts any key by
design: supplying a default value tells i18next the key need not exist yet. A typo is
therefore caught by `pnpm i18n:check`, not by the compiler — extraction regenerates the
catalogue and the check fails if that leaves uncommitted changes.

## Contributing

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- All user-facing strings go through `t('<namespace>.<key>', 'English default')`;
  commit the regenerated locale JSON alongside the source change.
- Further conventions live in [AGENTS.md](AGENTS.md).
