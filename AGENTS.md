# Repository Guidelines

## Project Structure & Module Organization

This TypeScript monorepo powers the Ventas Work Order app. `be/` contains the Fastify API, Prisma schema, services, routes, and tests under `be/src/**/__tests__` and `be/src/__tests__/integration`. `fe/` contains the React/Vite frontend: pages in `fe/src/pages`, UI in `fe/src/components`, API clients in `fe/src/lib`, and state in `fe/src/store`. `shared/` contains Zod schemas and shared types. Runtime orchestration lives in `deploy/`, reference material in `docs/`, and CSV seed data in `scripts/seed_data/`.

## Build, Test, and Development Commands

Use Docker for runtime and long-lived commands.

- `npm run dev` starts Postgres, backend, and frontend and follows logs.
- `npm run down` stops the Docker stack.
- `npm run build` builds all Docker images.
- `npm run db:migrate`, `npm run db:seed`, `npm run db:import`, and `npm run db:reset` run Prisma and seed tasks.
- `npm run shell:be` and `npm run shell:fe` open container shells.

Local URLs: frontend `http://localhost:3000`, backend `http://localhost:3001`, Postgres `localhost:5432`.

## Coding Style & Naming Conventions

Write TypeScript using ES modules. Follow the existing style: two-space indentation, semicolons, single quotes, and named exports where practical. React components and pages use `PascalCase.tsx`; hooks, stores, utilities, and API clients use names such as `authStore.ts` and `work-orders-api.ts`. ESLint is configured per package; `_`-prefixed unused variables warn, and explicit `any` is allowed when necessary.

## Testing Guidelines

Backend tests use Vitest. Unit tests live near services or routes as `*.unit.test.ts`; integration tests live under `be/src/__tests__/integration` as `*.integration.test.ts`. Use `npm run db:migrate` before integration work that needs schema changes. Package test commands are in `be/package.json`, but run them from the Docker backend shell.

## Commit & Pull Request Guidelines

Git history follows Conventional Commit-style subjects, for example `feat(work-order): ...`, `fix(work-order): ...`, `test(work-order): ...`, and `ci(woodpecker): ...`. Keep commits focused. Work should start from a GitHub issue, use an isolated branch/worktree, and open PRs against `dev`. PRs should link the issue, summarize behavior changes, include Docker/Woodpecker validation, and note migrations, seed changes, or screenshots for UI updates.

## CI Branch Boundaries

PR and `dev` checks run at `https://jmacpro.noonoon.cc/ci`. `main` checks run on `home-syno` at `https://ci.familyhub.id` as the production handoff check. Inspect `main` CI with `wpci home-syno pipeline last jaaacki/ventas_workorder_app`. Deployment beyond that is handled outside this repo unless configured here.

## Security & Configuration

Keep secrets in service-level `.env` files or environment variables. Do not commit tokens, passwords, private keys, or production credentials. OAuth, Bitrix, JWT, and database settings are wired through `deploy/docker-compose.yml`.
