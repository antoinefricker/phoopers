# Phoopers — task runner.
#
# Every target is a thin wrapper around a pnpm script, so the Makefile stays the
# single entry point without becoming a second source of truth. `make help`
# prints this list; it is generated from the `## ` comments below, so a new
# target documents itself by carrying one.

PNPM := pnpm
PWA := $(PNPM) --filter @phoopers/pwa

.DEFAULT_GOAL := help

.PHONY: help install dev build preview lint lint-fix format format-check typecheck test test-watch i18n-check i18n-extract ci clean

##@ General

help: ## Print this help
	@awk 'BEGIN {FS = ":.*?## "} \
		/^##@ / {printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next} \
		/^[a-zA-Z0-9_-]+:.*?## / {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo

##@ Setup

install: ## Install every workspace dependency from the lockfile
	$(PNPM) install

##@ Development

dev: ## Start the PWA dev server on http://localhost:5173
	$(PWA) dev

build: ## Production build of every workspace
	$(PNPM) build

preview: ## Serve the PWA production build locally
	$(PWA) preview

##@ Quality

lint: ## ESLint across the repo, then `prettier --check`
	$(PNPM) lint

lint-fix: ## ESLint `--fix`, then `prettier --write`
	$(PNPM) lint:fix

format: ## Prettier `--write` only
	$(PNPM) format

format-check: ## Prettier `--check` only
	$(PNPM) format:check

typecheck: ## `tsc --noEmit` in every workspace
	$(PNPM) typecheck

test: ## Vitest, run once (no watch)
	$(PNPM) test

test-watch: ## Vitest in watch mode on the PWA
	$(PWA) exec vitest

##@ I18n

i18n-check: ## Fail if the locale catalogue is out of date
	$(PNPM) i18n:check

i18n-extract: ## Regenerate `src/i18n/locales/*` from the `t()` calls
	$(PWA) extract:i18n

##@ Aggregates

ci: lint typecheck i18n-check test build ## Run the full CI pipeline as GitHub Actions does

clean: ## Remove build output and node_modules
	rm -rf apps/pwa/dist node_modules apps/*/node_modules
