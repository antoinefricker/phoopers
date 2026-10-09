# Phoopers

Create, save, and replay animated basketball plays — a 2D coach's-whiteboard view today,
a 3D view later.

## Requirements

- [nvm](https://github.com/nvm-sh/nvm) to pick up the pinned Node version, or Node 24
  installed some other way (see `.nvmrc`)
- [corepack](https://nodejs.org/api/corepack.html), shipped with Node, to install the
  pinned pnpm 10.8.0

## Getting started

```bash
git clone git@github.com:antoinefricker/phoopers.git
cd phoopers
nvm use          # Node 24, from .nvmrc
corepack enable  # pnpm 10.8.0, from package.json's packageManager
make install
```

`make install` also installs the Husky pre-commit hook, via the root `prepare` script.

Confirm the setup before changing anything — this runs the same sequence CI does:

```bash
make ci
```

Then start the dev server:

```bash
make dev
```

The app is served at http://localhost:5173.

## Make commands

The Makefile is the entry point for everyday tasks; each target is a thin wrapper around
the matching pnpm script, so nothing is duplicated. `make` on its own prints the list.

| Target              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `make help`         | Print every target with its description (the default)     |
| `make install`      | Install every workspace dependency from the lockfile      |
| `make dev`          | Start the PWA dev server on http://localhost:5173         |
| `make build`        | Production build of every workspace                       |
| `make preview`      | Serve the PWA production build locally                    |
| `make lint`         | ESLint across the repo, then `prettier --check`           |
| `make lint-fix`     | ESLint `--fix`, then `prettier --write`                   |
| `make format`       | Prettier `--write` only                                   |
| `make format-check` | Prettier `--check` only                                   |
| `make typecheck`    | `tsc --noEmit` in every workspace                         |
| `make test`         | Vitest, run once (no watch)                               |
| `make test-watch`   | Vitest in watch mode on the PWA                           |
| `make i18n-check`   | Fail if the locale catalogue is out of date               |
| `make i18n-extract` | Regenerate `src/i18n/locales/*` from the `t()` calls      |
| `make ci`           | The full CI pipeline, in the order GitHub Actions runs it |
| `make clean`        | Remove build output and `node_modules`                    |

## Scripts

The underlying pnpm scripts, if you prefer to call them directly. Run from the
repository root; each one fans out to every workspace.

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `pnpm lint`         | ESLint across the repo, then `prettier --check` |
| `pnpm lint:fix`     | ESLint `--fix`, then `prettier --write`         |
| `pnpm format`       | Prettier `--write` only                         |
| `pnpm format:check` | Prettier `--check` only                         |
| `pnpm typecheck`    | `tsc --noEmit` in every workspace               |
| `pnpm test`         | Vitest, run once (no watch)                     |
| `pnpm i18n:check`   | Fail if the locale catalogue is out of date     |
| `pnpm build`        | Production build of every workspace             |

Workspace-specific:

| Script                                     | What it does                               |
| ------------------------------------------ | ------------------------------------------ |
| `pnpm --filter @phoopers/pwa dev`          | Vite dev server                            |
| `pnpm --filter @phoopers/pwa preview`      | Serve the production build                 |
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
sequential job: lint → typecheck → i18n:check → test → build. `make ci` runs the same
sequence locally.

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
