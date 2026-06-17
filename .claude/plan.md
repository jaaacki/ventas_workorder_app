# Plan: Replace VB Work Order — AmGraft AppSheet app with Node.js

## 0. Goal
Rebuild the legacy AppSheet application **"VB Work Order - AmGraft®"** as a maintainable, self-hosted Node.js web application with a Fastify backend, React + Vite + Tailwind frontend, and PostgreSQL as the source of truth. The end state is full feature parity with the legacy app, including work-order lifecycle, phase/BOM/sterilisation/BET workflows, master data, labels/PDF reports, and Bitrix staff sync.

## 1. Ground already covered
- Parsed the 856-page AppSheet documentation export into `docs/ANALYSIS.md`, covering:
  - 12 real data tables and their schemas
  - Relationships and virtual/reference columns
  - 54 views grouped by table
  - 95 actions grouped by table
  - 7 AppSheet process bots and their business logic
  - Google Apps Script integrations (Bitrix24 user sync, AppSheet API wrapper, external PDF library)
- Reviewed the Google Apps Script source files under `docs/references/google_script/`.
- Confirmed the canonical Google Sheet ID: `1MTW18USJHOLCO7jNOLCnmaYPZ5S0Dte53Y5dwDWOJz0` (spreadsheet `BOM_WO`).

## 2. Key architectural decisions (based on your answers)
| Area | Decision |
|---|---|
| Backend | Fastify (Node.js) + TypeScript |
| Frontend | React + Vite + Tailwind CSS + TypeScript |
| Database | PostgreSQL (source of truth) |
| Data migration | One-time export from Google Sheets, import into PG; decommission Sheets after validation |
| Auth | Start with simple email/password + bcrypt/JWT; design schema so Microsoft/Google SSO can be added later without rewrites |
| Staff source | Continue syncing active Bitrix24 users into the `staff` table via a scheduled/admin job |
| PDF/labels | Port to Node.js using Puppeteer/pdfmake + label libraries; avoid dependence on the legacy Apps Script library |
| Deployment | Docker + docker-compose for local/dev; target container-friendly host (Render/Railway/self-managed VPS) |

## 3. Proposed directory layout
```
/Users/noonoon/Dev/ventas_workorder_app
├── be/                         # Fastify backend
│   ├── src/
│   │   ├── config/
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   ├── seeds/
│   │   │   └── schema.prisma or raw SQL
│   │   ├── modules/            # domain modules matching tables
│   │   │   ├── workOrders/
│   │   │   ├── phases/
│   │   │   ├── hets/
│   │   │   ├── boms/
│   │   │   ├── bomLines/
│   │   │   ├── manufacturers/
│   │   │   ├── procedures/
│   │   │   ├── staff/
│   │   │   ├── sterilises/
│   │   │   ├── woSerials/
│   │   │   └── phaseEquips/
│   │   ├── auth/
│   │   ├── integrations/
│   │   │   └── bitrix.ts       # user.search sync
│   │   ├── pdf/                # report/label generators
│   │   ├── routes.ts
│   │   └── server.ts
│   ├── tests/
│   ├── Dockerfile
│   └── package.json
├── fe/                         # React + Vite frontend
│   ├── src/
│   │   ├── api/                # typed API client
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── stores/
│   │   └── App.tsx
│   ├── public/
│   ├── Dockerfile
│   └── package.json
├── shared/                     # shared types & validation schemas (Zod)
├── scripts/                    # migration/seed helpers
├── docs/                       # existing + generated docs
├── docker-compose.yml
└── README.md
```

## 4. Execution phases
Because the legacy app has full feature parity as the goal, the work is split into an **MVP** plus expansion phases. Each phase is a shippable increment.

### Phase 1 — Foundation & data access (1–2 weeks)
1. Project scaffolding: `be/`, `fe/`, `shared/`, `docker-compose.yml`, Postgres service.
2. Set up Fastify + TypeScript + Zod + Prisma (or node-pg-migrate) + JWT auth scaffold.
3. Set up React + Vite + Tailwind + React Router + TanStack Query + a basic layout.
4. Connect to the live Google Sheet `BOM_WO` and export all worksheets to seed CSV/JSON.
5. Design normalized PostgreSQL schema from the 12 AppSheet tables (see `docs/ANALYSIS.md`).
6. Build a one-time migration script that maps Sheet rows → PG tables.
7. Seed dev database and verify data fidelity.

### Phase 2 — Core work-order CRUD & views (2–3 weeks)
1. Implement backend REST/JSON API for:
   - `workOrder` full lifecycle (create, read, update, list, filters)
   - `het`, `phase`, `bom`, `bomLine`, `manufacturer`, `procedure` master data CRUD
   - Related collections (`woSerial`, `sterilise`, `phaseEquip`)
2. Implement frontend pages mirroring the most-used AppSheet views:
   - Dashboard / work-order list
   - Work-order detail with inline phase/BOM/serial/sterilisation cards
   - Master data browsers (hets, phases, BOMs, manufacturers, procedures)
3. Re-implement key virtual columns and computed fields in SQL/JS (e.g., `label`, `phaseOrder`, `entryCountToday`, `REF_ROWS` equivalents).
4. Role/permission model (who can create/edit/close WO, who can sign off phases).

### Phase 3 — Phase workflow, sterilisation, BET, signatures (2–3 weeks)
1. Port the AppSheet process logic into backend services:
   - Phase progression (`startSignBy`, `endSignBy`, `nextPhase`, `previousWo`)
   - Sterilisation pass/fail flow (`sterilise` record creation, `steralisationCurrent` update)
   - BET (Biological Evaluation Test) pass/close flow
   - Work-order status machine (open → in-progress → sterilised/BET → closed)
2. Frontend wizard/flow UI for operators.
3. Digital signature capture/confirmation (initially password-confirm + timestamp; later e-signature image).
4. Audit logging (`createdOn`, `createdBy`, `updatedOn`, `updatedBy`) preserved.

### Phase 4 — Number generators, labels, PDF reports (1–2 weeks)
1. Re-implement ID generators:
   - `woId` (e.g., `WKO-...`), `hetId`, `manuId`, `woNumber`, etc.
   - `entryCountToday` counters and date-based prefixes.
2. Label generation (phase 3, 6, 9 labels from `printLabels` logic).
3. Work-order report PDF (`generateWoReport` → `reportPdf` file).
4. Production batch record PDF.
5. File storage: local/S3-compatible abstraction.

### Phase 5 — Staff sync, admin, polish, cutover (1–2 weeks)
1. Bitrix24 `user.search` sync job → `staff` table.
2. Admin screens for user/role management.
3. Import any remaining historical work orders; reconcile IDs.
4. Add remaining AppSheet views/actions not yet ported (bulk actions, advanced filters).
5. Performance tuning, tests, documentation, and cutover plan.

## 5. Immediate next steps (what I will do once the plan is approved)
1. Ask you to connect Google so I can export the live `BOM_WO` sheet data:
   - Run `! pc-tool google login` in this chat.
2. Scaffold `be/` and `fe/` with the chosen stack.
3. Export all worksheets from `BOM_WO` to `scripts/seed_data/`.
4. Create the initial PostgreSQL migration for the 12 tables and run it against a local Docker Postgres.
5. Write a seed importer and verify row counts against the source sheets.

## 6. Open questions to resolve during Phase 1
- Should I create a new repo branch for this work, or is this repo the target? (Current branch is `master`, main branch is `main`.)
- Exact hosting/deployment target (affects env config and file storage choice).
- Whether to use **Prisma** or raw SQL migrations + `node-pg`/Prisma client.
- Preferred e-signature mechanism (text confirmation, drawn signature, or SSO identity assertion).
- S3-compatible bucket credentials for PDF/label storage, or local disk for now?

## 7. Risks & mitigations
| Risk | Mitigation |
|---|---|
| AppSheet process formulas are complex and under-documented | Extract every formula from `docs/ANALYSIS.md`; validate against live sheet data; build unit tests around ported logic. |
| Historical IDs and generated numbers must stay consistent | Keep ID generation deterministic; seed counters from existing max values. |
| Google Sheets has become a shared dependency for other scripts | Audit `bitrixHelper.js` and `wrapperForAppSheet.js`; replace Sheet writes with API calls to the new backend or direct DB writes where safe. |
| Full parity is large | Ship MVP first; each phase is independently valuable. |

