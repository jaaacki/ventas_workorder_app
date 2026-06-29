# Cutover Runbook — Issue #36, D5

Procedure for the one-time migration cutover from the legacy
`BOM_WO` Google Sheet to the new Prisma/Postgres workorder system.
This document is the source of truth for the cutover; the PR that
introduces it captures the staged dry-run output and post-merge
sign-offs.

The pipeline was hardened in three earlier PRs (D1–D4) to make this
runbook safe to execute:

- **D2 — export**: `be/src/scripts/exportGoogleSheet.ts` produces
  12 timestamped CSVs from `BOM_WO` + a `manifest.json` with row
  counts and SHA-256 per file. Driven by `make db-export`.
- **D3 — import**: `be/src/scripts/importCsv.ts` is idempotent
  (row-by-row `prisma.upsert`), captures skipped/errored rows with
  reasons, and writes a JSON validation report. The `ManufacturerHet`
  join (GAP-1 from the D1 analysis) is derived from the cross-product
  of `workOrder.manuId × workOrder.batchHetIds` in an
  `afterImport` hook.
- **D4 — repeatability**: the export→import pipeline is proven
  byte-stable across N consecutive runs against `workorder-stg`
  (`be/src/scripts/__tests__/importRepeatability.integration.test.ts`).
- **D5 — this runbook + the production gate** in the importer CLI.

---

## 1. Pre-cutover checklist

Tick each box before scheduling the cutover window. If any of these
is false, do not proceed.

- [ ] Legacy `BOM_WO` Google Sheet is in normal operation; the data we
      intend to import is the data we'd see if we looked right now.
- [ ] `workorder-stg` (issue #34) has been re-imported from a fresh
      export of `BOM_WO` within the last 24 hours; the post-import
      `be/reports/import-<stamp>.json` shows `errored: []` and the
      spot-check sample-10 per entity (see §5) matches the sheet
      row-for-row.
- [ ] The 5-cycle repeatability run from PR #39 has been re-executed
      on `workorder-stg` in the last 7 days and reported identical
      row counts + SHA-256 per table across all 5 cycles. (The CI
      gate proves the code, not the staging data; this is the
      staging-data check.)
- [ ] Product owner has signed off the cutover plan and the
      rollback plan in writing.
- [ ] On-call engineer is acknowledged and available for the entire
      cutover window.
- [ ] The cutover freeze window start time and the planned
      `STAMP=<cutover-iso-stamp>` are recorded in the cutover PR
      description.

---

## 2. Cutover steps

All commands run from the repo root against the production `be` +
`postgres` stack via the `deploy/Makefile` targets. The stack is
already up; this runbook does not stop it until the rollback window
ends (see §3).

### 2.1 Freeze the legacy sheet

In the AppSheet `VB Work Order — AmGraft®` admin console, mark the
`BOM_WO` sheet read-only for all users except the service account.
The service account must still have read access — the export script
needs it.

Notify the floor that new work orders are paused; existing WOs in
flight should be completed before the freeze.

### 2.2 Take the final pre-cutover export

```sh
make db-export STAMP=<cutover-iso-stamp>
```

The export writes 12 CSVs and a `manifest.json` into
`be/scripts/seed_data/exports/<cutover-iso-stamp>/`. Archive the
whole directory to `s3://<cutover-bucket>/<cutover-iso-stamp>/` (or
your team's equivalent). Note the SHA-256 of `manifest.json` in the
cutover PR comment.

### 2.3 Archive the production DB (one-way door)

```sh
make db-archive-pre-cutover STAMP=<cutover-iso-stamp>
```

This dumps schema + data from the current production Postgres, tars
it, and writes a `.sha256` sidecar. The archive lands in
`deploy/data/cutover-archives/cutover-<cutover-iso-stamp>.tar.gz`.
Copy the archive off-host (out of `deploy/data/`) to the cutover
bucket immediately — the deploy/ directory is not designed for
durable storage.

### 2.4 Run the import

The importer CLI now refuses to run a real (non `--dry-run`) import
unless `WORKORDER_ENV=staging` is set OR `--confirm-prod` is passed
explicitly. The cutover is the one and only sanctioned use of
`--confirm-prod`. Double-check the env first:

```sh
# Sanity: refuse unless the env is explicitly "production" or the
# cutover-iso-stamp is in the prod env. The Make target below is the
# only sanctioned entry point.
unset WORKORDER_ENV   # make sure no stale staging marker is set
```

Then run the cutover import via the make target (which sets
`WORKORDER_ENV=production` for the duration of the import so the
gate accepts the call without needing `--confirm-prod` on the
command line — this keeps the secret out of shell history):

```sh
make db-import-cutover STAMP=<cutover-iso-stamp>
```

If you must run the importer by hand (e.g. for a one-off dry-run
rehearsal against `workorder-stg`), use:

```sh
WORKORDER_ENV=staging make db-import STAMP=<cutover-iso-stamp>
# ...or, only for the real cutover:
docker compose -f deploy/docker-compose.yml exec be \
  npm run db:import -- /app/scripts/seed_data/exports/<cutover-iso-stamp> --confirm-prod
```

The importer writes a JSON report to
`be/reports/import-<cutover-iso-stamp>.json`. Verify the report:

```sh
cat be/reports/import-<cutover-iso-stamp>.json | jq '.totals, .errored'
```

`errored` must be `[]`. `skipped` must be `[]` (or only contain
rows with documented reasons, e.g. optional FK fields left blank
in the legacy sheet). If either is non-empty, **stop the cutover**
and consult §3.

### 2.5 Spot-check (sample-10 per entity)

Run a row-count diff between the legacy export's `manifest.json` and
the new-system DB:

```sh
# pseudo-code: see the cutover PR description for the exact script
make db-verify-cutover STAMP=<cutover-iso-stamp>
```

Then run the sample-10 audit (10 random rows per entity, comparing
each row's fields against the source CSV). Embed the audit log in
the cutover PR description.

### 2.6 Flip DNS / auth (out of scope)

This is a separate change managed by the platform team. The
cutover PR does not own DNS or auth.

---

## 3. Rollback

The cutover is reversible as long as the pre-cutover archive
(§2.3) is intact.

### 3.1 Stop writes on the new system

In the AppSheet admin console, mark the new workorder system
read-only. (The new system is the workorder-app frontend/API;
`workorder-app@general-431514.iam.gserviceaccount.com` for the
Google side, the be+postgres stack for the system side.) The goal
is to prevent any in-flight WO from being written to the new
DB after we start the restore.

### 3.2 Restore the production DB

```sh
make db-archive-pre-cutover STAMP=<cutover-iso-stamp>   # no-op if already archived
make db-restore-cutover STAMP=<cutover-iso-stamp>
# (which expands to:)
#   gunzip -c deploy/data/cutover-archives/cutover-<stamp>.tar.gz \
#     | tar -xO - cutover-<stamp>.sql \
#     | docker compose -f deploy/docker-compose.yml exec -T postgres \
#         psql -U workorder -d workorder -v ON_ERROR_STOP=1
```

Verify the restore by re-running the row-count + sample-10 audit
(§2.5) and comparing against the **pre-cutover** snapshot, not the
new-system baseline. Row counts and SHA-256s must match the
archive's `manifest.json` from §2.2.

### 3.3 Re-enable legacy writes

In AppSheet, restore editor access to the `BOM_WO` sheet. The
service account can stay at `viewer` until the next cutover
attempt; promote it back to `editor` only when a new cutover is
scheduled.

### 3.4 Notify

- Page on-call with the rollback timestamp and the cutover PR link.
- Notify the product owner that the cutover attempt is rolled
  back and the legacy system is the source of truth again.
- Open a post-mortem issue linking the cutover PR, the rollback
  archive, and the row that caused the abort.

---

## 4. Post-cutover verification (success path)

After a successful cutover, leave the new system in read-only for
one business day while the sample-100 audit runs in the background
(comparing the legacy export's `manifest.json` to the new-system
DB row-for-row). Archive the audit log in the cutover PR.

After the audit passes:

1. Mark `BOM_WO` deprecated in AppSheet (do not delete — keep the
   data for the audit retention period).
2. Close issue #36 with a "Cutover complete" comment linking the
   cutover PR.
3. Remove the `--confirm-prod` gate from the importer CLI in a
   follow-up PR (D6 — not in scope of this issue; the gate is
   intentionally left in place until the next schema-change
   cutover so it can be re-armed cheaply).

---

## 5. Spot-check scripts (reference)

### Row-count diff

For each of the 12 entities, `count(*)` in the new DB must equal
the row count in the corresponding `manifest.json` entry.

### Sample-10 per entity

For each of the 12 entities, take 10 random rows from the source
CSV, run them through `importCsv.mapRow` in dry-run mode, and
compare every field. Fail loudly on any mismatch. The
`be/src/scripts/__tests__/importCsv.integration.test.ts` mock-based
test demonstrates the mapRow shape; the spot-check is a one-shot
script that uses the real importer, not the mock.

---

## 6. Make target summary

| Target | Purpose | Used by |
|---|---|---|
| `make db-export` | Export the live `BOM_WO` sheet to timestamped CSVs. | §2.2 |
| `make db-archive-pre-cutover STAMP=…` | Dump + tar + sha256 the production DB. | §2.3, §3.2 |
| `make db-snapshot` / `make db-restore SNAP=…` | Repeatability scaffolding for `workorder-stg`. | D4 |
| `make db-import-cycle STAMP=…` | One full export → import cycle. | D4 |
| `make db-import-cutover STAMP=…` | The cutover import; sets `WORKORDER_ENV=production` so the gate accepts the call. | §2.4 |
| `make db-restore-cutover STAMP=…` | Rollback path; pipes the archive back into Postgres. | §3.2 |
| `make db-verify-cutover STAMP=…` | Row-count + sample-10 spot check. | §2.5, §3.2 |

Targets prefixed with `cutover-` (vs. `stg-` or bare) are
intentionally destructive. They will not prompt for confirmation
— the cutover PR is the place where the human "yes" is recorded.
