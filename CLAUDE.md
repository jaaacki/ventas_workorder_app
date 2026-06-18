# Development Workflow

This file defines how Claude Code and other contributors should work in this repository.

## Planning and git flow

- **Issue-first.** Every body of work starts from a GitHub issue.
- **One worktree per issue**, created in `.claude/worktrees/<issue-name>`.
- **One issue may span multiple PRs.** Each mergeable phase becomes its own PR.
- **All PRs target `dev`.** Once `dev` is approved, merge it into `main` via a separate PR.
- **Never commit directly to `dev` or `main`.**

## Local environment

- The canonical local environment is **Docker**. Use `docker compose` or the project's wrapper scripts for builds, tests, migrations, and seeds.
- **Never run `npm install`, `pnpm install`, or long-lived build/test commands directly on the host machine.**
- CI also runs in Docker via the local Woodpecker instance.

## Persistent data

- Service data is persisted in a `./data` folder **inside the service's own directory**.
- Do not use Docker named volumes for service data.

## Documentation

- The only markdown document that lives in the repo is `README.md`.
- All other development history belongs in git history, GitHub issues, and pull requests.
- `docs/` is allowed for reference material.
- `.claude/` is for local scratch only and must never be committed.

## CI pipeline strategy

- **Pull requests:** fast checks only — lint, unit tests, typecheck, build. No database.
- **`dev` / `main` pushes:** full integration tests against a real PostgreSQL database, as close to production as possible.
- Backend tests are split into `vitest.unit.config.ts` and `vitest.integration.config.ts`.
- Test files are excluded from `tsc` build output via `tsconfig.json`.

## Local DevOps / Woodpecker Workflow

- Local CI runs in Woodpecker at `https://jmacpro.noonoon.cc/ci`.
- Persistent local infra is managed outside this repo under `~/Dev/docker`.
- Agents must not run project package, test, build, database, or app-server commands on the host.
- Agents may inspect files, edit files, run Git commands, and run safe structural checks such as `git diff --check`.
- Validation happens by pushing a branch/PR and reading the local Woodpecker result.
- PR checks are fast feedback. Passing PR checks means the branch is a candidate for merge into `dev`.
- `main` remains the production handoff branch; remote CI/CD owns staging/production deployment unless this repo says otherwise.
- Do not recreate git-runner, GitHub runner, or host-local dependency/test workflows.

## Security

- Secrets and credentials live only in service-level `.env` files.
- Never commit tokens, passwords, or private keys.
