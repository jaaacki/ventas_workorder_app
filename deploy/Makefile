.PHONY: up down build logs shell-be shell-fe db-migrate db-seed db-reset db-export db-import db-snapshot db-restore db-import-cycle

SNAPSHOT_DIR := $(CURDIR)/data/snapshots
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

db-reset:
	docker compose -f docker-compose.yml exec be npx prisma migrate reset --force --skip-seed

# D2 (PR#1): export the BOM_WO Google Sheet to timestamped CSVs in
# be/scripts/seed_data/exports/<stamp>/. Requires GOOGLE_SERVICE_ACCOUNT_JSON
# and BOM_WO_SHEET_ID in be/.env.
db-export:
	docker compose -f docker-compose.yml exec be npm run db:export

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
