.PHONY: up down build logs shell-be shell-fe db-migrate db-seed db-reset db-export db-export-inventory db-import db-import-procurement db-import-inventory db-snapshot db-restore db-import-cycle db-archive-pre-cutover db-import-cutover db-restore-cutover db-verify-cutover

SNAPSHOT_DIR := $(CURDIR)/data/snapshots
CUTOVER_DIR  := $(CURDIR)/data/cutover-archives
PROCUREMENT_DIR := /app/data/legacy
INVENTORY_DIR := /app/data/inventory
PG_USER := workorder
PG_DB   := workorder

up:
	docker compose -f docker-compose.yml up -d

down:
	docker compose -f docker-compose.yml down

build:
	docker compose -f docker-compose.yml build

logs:
	docker compose -f docker-compose.yml logs -f

shell-be:
	docker compose -f docker-compose.yml exec be sh

shell-fe:
	docker compose -f docker-compose.yml exec fe sh

db-migrate:
	docker compose -f docker-compose.yml exec be npx prisma migrate dev

db-seed:
	docker compose -f docker-compose.yml exec be npm run db:seed

db-import:
	docker compose -f docker-compose.yml exec be npm run db:import

db-import-procurement:
	docker compose -f docker-compose.yml exec be npm run db:import:procurement -- --source-dir=$(PROCUREMENT_DIR)

db-import-inventory:
	docker compose -f docker-compose.yml exec be npm run db:import:inventory -- --source-dir=$(INVENTORY_DIR)

db-reset:
	docker compose -f docker-compose.yml exec be npx prisma migrate reset --force --skip-seed

# D2 (PR#1): export the BOM_WO Google Sheet to timestamped CSVs in
# be/scripts/seed_data/exports/<stamp>/. Requires GOOGLE_SERVICE_ACCOUNT_JSON
# and BOM_WO_SHEET_ID in be/.env.
db-export:
	docker compose -f docker-compose.yml exec be npm run db:export

db-export-inventory:
	docker compose -f docker-compose.yml exec be npm run db:export:inventory -- --output-dir=$(INVENTORY_DIR)

db-reset:
	docker compose -f docker-compose.yml exec be npx prisma migrate reset --force --skip-seed

# D4 (PR#3): pre/post-import snapshots so the repeatability claim is
# verifiable by hand on workorder-stg. Snapshots land in deploy/data/snapshots/
# (gitignored). Use STAMP=<name> to override the timestamp; defaults to
# YYYYMMDD-HHMMSS.
db-snapshot:
	@mkdir -p $(SNAPSHOT_DIR)
	@STAMP=$${STAMP:-$$(date +%Y%m%d-%H%M%S)}; \
	docker compose -f docker-compose.yml exec -T postgres \
	  pg_dump -U $(PG_USER) -d $(PG_DB) --data-only --no-owner --no-privileges \
	  > $(SNAPSHOT_DIR)/$${STAMP}.sql && \
	echo "snapshot: $(SNAPSHOT_DIR)/$${STAMP}.sql"

# D4: restore a named snapshot. Drops & recreates all tables in the
# workorder-stg DB from a .sql dump produced by `make db-snapshot`. WARNING:
# destructive. Requires SNAP=<name> (without .sql extension).
db-restore:
	@test -n "$(SNAP)" || (echo "ERROR: set SNAP=<snapshot-name> (no .sql)"; exit 1)
	@test -f $(SNAPSHOT_DIR)/$(SNAP).sql || (echo "ERROR: $(SNAPSHOT_DIR)/$(SNAP).sql not found"; exit 1)
	docker compose -f docker-compose.yml exec -T postgres \
	  psql -U $(PG_USER) -d $(PG_DB) -v ON_ERROR_STOP=1 \
	  < $(SNAPSHOT_DIR)/$(SNAP).sql
	@echo "restored from: $(SNAPSHOT_DIR)/$(SNAP).sql"

# D4: one full export → import cycle against the running stack. Used by
# PR#3's repeatability proof and by the cutover dry-run in PR#4. STAMP is
# optional; defaults to YYYYMMDD-HHMMSS. To make the cycle run against a
# local CSVs directory instead of re-exporting from the sheet, set
# SKIP_EXPORT=1 and IMPORT_DIR=<absolute path>.
db-import-cycle:
	@STAMP=$${STAMP:-$$(date +%Y%m%d-%H%M%S)}; \
	if [ -z "$$SKIP_EXPORT" ]; then \
	  docker compose -f docker-compose.yml exec be npm run db:export -- --stamp=$${STAMP}; \
	  EXPORT_DIR=/app/scripts/seed_data/exports/$${STAMP}; \
	else \
	  EXPORT_DIR=$${IMPORT_DIR}; \
	  test -n "$$EXPORT_DIR" || (echo "ERROR: SKIP_EXPORT=1 requires IMPORT_DIR"; exit 1); \
	fi; \
	docker compose -f docker-compose.yml exec be npm run db:import -- $${EXPORT_DIR}; \
	docker compose -f docker-compose.yml exec be sh -c 'ls -1 /app/be/reports/ || true'

# D5 (PR#4): take a full pre-cutover archive of the production DB
# (schema + data, no owner/privileges). The archive is tarred + sha256'd
# into deploy/data/cutover-archives/cutover-<stamp>.{sql,tar.gz,sha256}.
# STAMP is the only required arg and SHOULD be the canonical cutover
# date (e.g. 2026-07-15T0900Z). The same stamp is referenced from the
# cutover PR description and from the post-cutover verification log.
db-archive-pre-cutover:
	@test -n "$(STAMP)" || (echo "ERROR: set STAMP=<cutover-iso-stamp> (e.g. 2026-07-15T0900Z)"; exit 1)
	@mkdir -p $(CUTOVER_DIR)
	@STAMP=$(STAMP); \
	docker compose -f docker-compose.yml exec -T postgres \
	  pg_dump -U $(PG_USER) -d $(PG_DB) --no-owner --no-privileges \
	  > $(CUTOVER_DIR)/cutover-$${STAMP}.sql && \
	tar -czf $(CUTOVER_DIR)/cutover-$${STAMP}.tar.gz -C $(CUTOVER_DIR) cutover-$${STAMP}.sql && \
	sha256sum $(CUTOVER_DIR)/cutover-$${STAMP}.tar.gz \
	  | tee $(CUTOVER_DIR)/cutover-$${STAMP}.sha256 && \
	echo "archive: $(CUTOVER_DIR)/cutover-$${STAMP}.tar.gz"

# D5 (PR#4): the cutover import. Runs the same db-import-cycle pipeline
# but with WORKORDER_ENV=production set so the importer CLI's
# --confirm-prod gate accepts the call. The gate (added in PR#4) refuses
# any real import against a non-staging target without an explicit
# --confirm-prod; this target is the sanctioned way to set the env
# without putting the secret flag in shell history.
db-import-cutover:
	@test -n "$(STAMP)" || (echo "ERROR: set STAMP=<cutover-iso-stamp>"; exit 1)
	@STAMP=$(STAMP); \
	EXPORT_DIR=/app/scripts/seed_data/exports/$${STAMP}; \
	test -d $$EXPORT_DIR || (echo "ERROR: export dir $$EXPORT_DIR not found — run 'make db-export STAMP=$${STAMP}' first"; exit 1); \
	docker compose -f docker-compose.yml exec -T -e WORKORDER_ENV=production be \
	  npm run db:import -- $${EXPORT_DIR} && \
	docker compose -f docker-compose.yml exec be sh -c 'ls -1 /app/be/reports/ | tail -1 | xargs -I{} cat /app/be/reports/{}'

# D5: rollback path. Pipes the cutover-<stamp>.tar.gz archive back
# into the postgres container. Destroys current DB state — this is
# intentionally destructive.
db-restore-cutover:
	@test -n "$(STAMP)" || (echo "ERROR: set STAMP=<cutover-iso-stamp>"; exit 1)
	@test -f $(CUTOVER_DIR)/cutover-$(STAMP).tar.gz || (echo "ERROR: archive not found: $(CUTOVER_DIR)/cutover-$(STAMP).tar.gz"; exit 1)
	docker compose -f docker-compose.yml exec -T postgres \
	  bash -c "gunzip -c /dev/stdin | psql -U $(PG_USER) -d $(PG_DB) -v ON_ERROR_STOP=1" \
	  < <(tar -xOzf $(CUTOVER_DIR)/cutover-$(STAMP).tar.gz cutover-$(STAMP).sql)
	@echo "restored from: $(CUTOVER_DIR)/cutover-$(STAMP).tar.gz"

# D5: post-cutover row-count + sample-10 spot check. Compares
# scripts/seed_data/exports/<stamp>/manifest.json (row counts) against
# the current DB counts; samples 10 rows per entity and asserts
# every field matches the source CSV. See docs/CUTOVER.md §2.5.
db-verify-cutover:
	@test -n "$(STAMP)" || (echo "ERROR: set STAMP=<cutover-iso-stamp>"; exit 1)
	docker compose -f docker-compose.yml exec be npx tsx src/scripts/verifyCutover.ts $(STAMP)
