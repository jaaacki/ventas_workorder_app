# Ventas Work Order App

Node.js replacement for the legacy **VB Work Order — AmGraft®** AppSheet application.

## Stack

- **Backend:** Fastify + TypeScript + Prisma + PostgreSQL
- **Frontend:** React + Vite + Tailwind CSS + TypeScript
- **Shared:** Zod schemas/types workspace
- **Runtime:** Docker Compose under `./deploy/`

## Getting started

All commands run through Docker. Do not run `npm install` or long-lived commands directly on the host.

```bash
# Start the whole stack (postgres, backend, frontend)
npm run dev

# Or use the deploy Makefile directly
cd deploy && make up
```

- Backend: http://localhost:3001
- Frontend: http://localhost:3000

### Useful commands

```bash
npm run down              # Stop all services
npm run db:migrate        # Run Prisma migrations inside the backend container
npm run db:seed           # Run the seed script
npm run db:reset          # Reset the database
npm run shell:be          # Open a shell in the backend container
npm run shell:fe          # Open a shell in the frontend container
```

## Project structure

- `be/` — Fastify backend (API, DB, integrations, PDF generation)
- `fe/` — React frontend
- `shared/` — Shared validation schemas and types
- `deploy/` — Docker Compose and runtime orchestration
- `docs/` — Legacy AppSheet documentation and analysis
- `scripts/` — Migration/seed helpers

## Branching

Development follows the issue → worktree → PR → `dev` → `main` flow. See `.claude/plan.md` and the global CLAUDE.md for details.

## License

Private — AmGraft / Ventas.
