# Ventas Work Order App

A **manufacturing execution system (MES) for regulated human-tissue production** — AmGraft® dental grafts — replacing the legacy **VB Work Order** AppSheet/Google-Sheets stack with a single traceable system of record.

## What the system achieves

One unbroken chain of custody and evidence, from donor clinic to finished product:

```
Clinic → collect raw tissue (HET) → production phases (one work order per phase,
the HET carries through the chain) → combine at C12 → sterilisation/BET gates
→ release → finished-goods LOT
```

Everything hangs off that spine:

1. **Traceability** — every HET is traceable in both directions: which clinic it came from, which work orders touched it, which LOT it became. A regulatory non-negotiable for human tissue.
2. **Enforced process** — phases run in order; gates block advancement (a sterilisation/BET pass is required to leave a gate phase); evidence is mandatory per phase (serials, equipment, output quantity, photo, sign-off signatures). The system *refuses* wrong process rather than merely recording it.
3. **Immutable history** — each phase is its own work order chained by the HET (`previousWoId`); evidence is never wiped; audit events are append-only. The batch record for any LOT is reconstructible.
4. **Configurable lines** — the Workflow > Phase > Step configurator defines product lines (phase order, gates, combine rules, BOMs, allowed equipment) without code changes.

## Who it serves

| Role | Value |
|---|---|
| **Operator** | The board shows where every run is right now — one card per HET run moving across phase columns. Opening a run shows exactly what this phase needs and what blocks advancement. No paper traveler. |
| **QA** | Queues for what awaits a sterilisation pass, what is quarantined, and what is ready to release — gate decisions with the evidence attached. |
| **Production manager** | Line overview: run progress per phase, stalled runs, cycle times, and the raw-material (HET collection) pipeline. |
| **Auditor / regulator** | From a LOT, the full genealogy: clinic, HET, every phase with evidence, signatures, and timestamps — in minutes, not days of spreadsheet archaeology. |

## Domain vocabulary

- **HET** — the raw-material unit (human tissue container) collected from a donor clinic. The state that carries through an entire production run.
- **Work order** — one HET at one phase. Advancing completes the current work order and spawns the next phase's work order, chained via `previousWoId`.
- **Phase** — a group of one or more steps (e.g. `A1`, `A3, A4, A5`) with behaviour levers: `isGate` (sterilisation/BET), `blocksCombine`, BOM, allowed equipment.
- **C12 combination** — the phase where multiple individual HETs merge into a combined batch (tracked via `workOrderHet`).
- **LOT** — the finished-goods lot number (`WorkOrder.manuNumber`) assigned to a released run; links to finished-goods inventory.

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
- API docs: http://localhost:3001/api/docs
- OpenAPI JSON: http://localhost:3001/api/openapi.json

### Useful commands

```bash
npm run down              # Stop all services
npm run db:migrate        # Run Prisma migrations inside the backend container
npm run db:seed           # Run the default seed script
npm run db:import         # Import CSV seed data from scripts/seed_data/
npm run db:reset          # Reset the database
npm run shell:be          # Open a shell in the backend container
npm run shell:fe          # Open a shell in the frontend container
```

### Legacy data migration

The reproducible migration runbook (raw legacy CSV → coherent board):

```bash
db:migrate → db:seed → db:import → db:backfill:legacy-coherence → db:sync:het-inventory
```

`db:backfill:legacy-coherence` wires imported work orders into the chain model: attaches them to their workflow, links each HET run (`previousWoId`/`nextPhaseId`), marks terminal finished runs released, and bridges finished-goods lots by LOT number (`manuNumber`).

## Project structure

- `be/` — Fastify backend (API, DB, integrations, PDF generation)
- `fe/` — React frontend
- `shared/` — Shared validation schemas and types
- `deploy/` — Docker Compose and runtime orchestration
- `docs/` — Legacy AppSheet documentation and analysis
- `scripts/` — Migration/seed helpers

## Branching

Development follows the issue → worktree → PR → `dev` → `main` flow. See `AGENTS.md` and `CLAUDE.md` for repository workflow, validation, and CI policy.

## License

Private — AmGraft / Ventas.
