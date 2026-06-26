# Development Workflow

This file defines how Claude Code and other contributors should work in this repository.

## Planning and git flow

- **Issue-first.** Every body of work starts from a GitHub issue.
- **One worktree per issue**, created in `.claude/worktrees/<issue-name>`.
- **One issue may span multiple PRs.** Each mergeable phase becomes its own PR.
- **All PRs target `dev`.** Once `dev` is approved, merge it into `main` via a separate PR.
- **Never commit directly to `dev` or `main`.**

## Git History Source Of Truth

- Use GitHub issues, branches/worktrees, commits, PR descriptions/comments/reviews, CI/Woodpecker results, and merge history as the durable development record.
- Do not create temporary repo markdown such as `PLAN.md`, `STATUS.md`, `NOTES.md`, `IMPLEMENTATION.md`, `SUMMARY.md`, `TODO.md`, or committed `.claude/plan.md`.
- Local scratch notes must stay untracked/ignored and be removed before final status.
- Start work from a GitHub issue. If none exists, create or identify one before implementation.
- Use an isolated branch/worktree for each issue unless repo policy says otherwise.
- Link related issues. Create an umbrella issue when multiple related issues need shared coordination, ordering, acceptance criteria, or rollout tracking.
- Put implementation summaries, validation evidence, risks, and follow-ups in the PR body/comments, not local markdown.
- For normal work, open a PR to the repo's integration branch, usually `dev`, and use local Woodpecker or the repo's configured CI as the validation record.
- For hotfixes, create/identify the issue first, branch/worktree from `main`, PR back to `main` unless explicit emergency policy allows direct push, then backport/forward-port with linked issue/PR as needed.
- Durable repo docs (`README.md`, `docs/`, `CLAUDE.md`/`AGENTS.md`, specs, changelogs) are allowed when they document stable repo/product facts.

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

- Woodpecker CI files live in `.woodpecker/`:
  - `.woodpecker/pr.yml` — fast PR checks (lint, typecheck, unit tests, build). No database.
  - `.woodpecker/dev.yml` — full integration tests against a real PostgreSQL database for `dev` pushes on `jmacpro.noonoon.cc`.
  - `.woodpecker/main.yml` — same integration checks for `main` pushes on `home-syno` / `ci.familyhub.id`; this is the main-branch production handoff check.
- Backend tests are split into `vitest.unit.config.ts` and `vitest.integration.config.ts`.
- Test files are excluded from `tsc` build output via `tsconfig.json`.

## Local DevOps / Woodpecker Workflow

- PR and `dev` CI run in Woodpecker at `https://jmacpro.noonoon.cc/ci`.
- `main` CI runs on the `home-syno` Woodpecker instance at `https://ci.familyhub.id`.
- Use `wpci home-syno ...` for main-branch CI inspection, for example `wpci home-syno pipeline last jaaacki/ventas_workorder_app`.
- Persistent local infra is managed outside this repo under `~/Dev/docker`.
- Agents must not run project package, test, build, database, or app-server commands on the host.
- Agents may inspect files, edit files, run Git commands, and run safe structural checks such as `git diff --check`.
- Validation happens by pushing a branch/PR and reading the matching Woodpecker result.
- PR checks are fast feedback. Passing PR checks means the branch is a candidate for merge into `dev`.
- `main` remains the production handoff branch. The repo-owned `main` check runs on `home-syno`; any staging/production deployment beyond that is handled outside this repo unless configured here.
- Do not recreate git-runner, GitHub runner, or host-local dependency/test workflows.

## Security

- Secrets and credentials live only in service-level `.env` files.
- Never commit tokens, passwords, or private keys.
