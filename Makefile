# Phoopers — task runner.
#
# Every target is a thin wrapper around a pnpm script, so the Makefile stays the
# single entry point without becoming a second source of truth. `make help`
# prints this list; it is generated from the `## ` comments below, so a new
# target documents itself by carrying one.

PNPM := pnpm
PWA := $(PNPM) --filter @phoopers/pwa
DEV_PORT := 5173

.DEFAULT_GOAL := help

.PHONY: help install dev stop build preview lint lint-fix format format-check typecheck test test-watch i18n-check i18n-extract ci clean

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

# The one target that wraps no pnpm script: stopping a server is a thing you do to a
# process, not to a workspace. It kills by PORT rather than by checkout, so it also
# reaches a server a worktree or another clone left listening — which is the usual
# reason the page in the browser is not the code you are editing.
stop: ## Stop whatever is serving http://localhost:5173
	@pids=$$(lsof -ti tcp:$(DEV_PORT) 2>/dev/null); \
	if [ -z "$$pids" ]; then \
		echo "Nothing is listening on port $(DEV_PORT)."; \
	else \
		kill $$pids && echo "Stopped $$(echo $$pids | wc -w | tr -d ' ') process(es) on port $(DEV_PORT)."; \
	fi

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
