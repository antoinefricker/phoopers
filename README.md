# Phoopers

Create, save, and replay animated basketball plays — a 2D coach's-whiteboard view today,
a 3D view later.

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

`i18n:check` is the one worth knowing about before it fails on you: a mistyped translation
key is **not** a compile error, so that step catches it instead. The reason, and the i18n
conventions generally, are in [AGENTS.md](AGENTS.md).

## Documentation

- [Roadmap](documentation/roadmap.md) — the product vision and phasing.
- [Specs](documentation/specs/index.md) — validated designs, one per sub-project.
- [Plans](documentation/plans/index.md) — implementation plans, one per spec.
- [Known limitations](documentation/limitations.md) — every limitation, defect and coverage gap, with what it costs.

## Contributing

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- All user-facing strings go through `t()` with an English default, and the regenerated
  locale JSON is committed alongside the source change.
- Further conventions live in [AGENTS.md](AGENTS.md).
