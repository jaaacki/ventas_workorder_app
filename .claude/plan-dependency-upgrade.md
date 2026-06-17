# Plan: Upgrade all dependencies to latest LTS / stable

## Goal
Bring every runtime, base image, and npm dependency up to the current latest LTS / stable release, with zero outdated packages remaining. Verify the full stack still builds and passes smoke tests in Docker.

## Current state snapshot
| Layer | Current | Latest LTS / stable (as of 2026-06-17) |
|---|---|---|
| Node base image / engine | `node:20-alpine` / `>=20.0.0` | `node:24-alpine` / `>=24.0.0` |
| PostgreSQL image | `postgres:16-alpine` | `postgres:18-alpine` |
| Backend deps | Fastify 4.x, Prisma 5.x, Zod 3.x, TS 5.x, ESLint 8.x, Vitest 1.x | Fastify 5.x, Prisma 7.x, Zod 4.x, TS 6.x, ESLint 10.x, Vitest 4.x |
| Frontend deps | React 18.x, RR 6.x, Vite 5.x, Tailwind 3.x, TS 5.x, ESLint 8.x | React 19.x, RR 7.x, Vite 8.x, Tailwind 4.x, TS 6.x, ESLint 10.x |
| Shared deps | Zod 3.x, TS 5.x | Zod 4.x, TS 6.x |

`npm-check-updates --workspaces --target latest` already produced the exact target versions.

## Proposed approach

### 1. Issue & isolated worktree
- Create GitHub issue: `chore(deps): upgrade all dependencies to latest LTS / stable`.
- Create worktree `.claude/worktrees/deps-lts-upgrade` on branch `chore/deps-lts-upgrade` from `dev`.

### 2. Update package manifests
- **Root `package.json`**: bump `engines.node` to `>=24.0.0`.
- **Backend `be/package.json`**: bump every dependency to the `ncu --target latest` versions. Add explicit `openapi-types` and `@fastify/swagger` because `fastify-type-provider-zod@6` declares them as peer dependencies.
- **Frontend `fe/package.json`**: bump every dependency to the `ncu --target latest` versions.
- **Shared `shared/package.json`**: bump `zod` and `typescript`.

### 3. Update Docker / compose manifests
- `be/Dockerfile`: `node:20-alpine` → `node:24-alpine`.
- `fe/Dockerfile`: `node:20-alpine` → `node:24-alpine`.
- `deploy/docker-compose.yml`: `postgres:16-alpine` → `postgres:18-alpine`.

### 4. Regenerate lockfile inside Docker
- Run `docker run --rm -v $(pwd):/app -w /app node:24-alpine npm install` so the host never runs `npm install` directly. This refreshes `package-lock.json` for the new versions.

### 5. Fix breaking changes (expected)
- **Tailwind v4**: replace `fe/src/index.css` directives with `@import "tailwindcss";`, update `fe/postcss.config.js` to use `@tailwindcss/postcss`, and remove the now-unnecessary `fe/tailwind.config.js` (no custom theme in use).
- **ESLint 9/10 flat config**: add `be/eslint.config.js` and `fe/eslint.config.js` because the old `.eslintrc` format is removed in ESLint 10. Keep the same rule sets (`@eslint/js`, `typescript-eslint`, React hooks/refresh plugins) where applicable.
- **Fastify v5 + type provider v6**: verify plugin registration still compiles; add missing peer deps if needed.
- **Prisma 7**: run `prisma generate` / `prisma migrate` in the updated container.
- **Zod v4 + TS v6**: run `tsc --noEmit` in all workspaces and fix any type errors.

### 6. Verify in Docker
- `make -C deploy build` (or `docker compose build`).
- `docker compose up -d` and wait for health checks.
- Backend smoke: `curl http://localhost:3001/health`.
- Frontend smoke: `curl -I http://localhost:5173` (dev) or build/prod image.
- Run backend tests: `docker compose exec be npm test` (Vitest).

### 7. PR & merge workflow
- Commit and push branch `chore/deps-lts-upgrade`.
- Open PR to `dev`, fill with upgrade summary and test results.
- Wait for Woodpecker CI; address any failures.
- Merge to `dev`, then merge `dev` to `main` per repo workflow.

### 8. Cleanup
- Switch main checkout to `main`, pull.
- Remove worktree and delete local/remote `chore/deps-lts-upgrade` branch.

## Risks / decisions for you
1. **Node 24 vs Node 22**: Node 24 is the newest Active LTS (container shows `v24.16.0`). Node 22 is also Active but older. Recommendation: Node 24.
2. **ESLint**: no ESLint config files exist today. To keep ESLint functional after upgrading to v10, I will create flat-config files. If you prefer to drop linting entirely, I can remove the ESLint deps instead.
3. **Major-version app code**: the source is small, but Fastify/Prisma/React Router jumps are major bumps. I will fix compile/runtime issues as they surface; any non-obvious behavioral change will be flagged in the PR.

## Expected outcome
- All `package.json` dependencies are at latest stable major versions.
- `engines.node` and all Docker images match Node 24 LTS / Postgres 18.
- `npm outdated --workspaces` returns `{}` (nothing outdated).
- Docker build, backend health check, and any existing tests pass.
