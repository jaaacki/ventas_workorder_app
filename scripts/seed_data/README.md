# Seed data

Place exported CSV files from the legacy Google Sheet (`BOM_WO`) in this directory.

## Expected files

The CSV importer (`be/src/scripts/importCsv.ts`) looks for these files:

- `staff.csv`
- `manufacturer.csv`
- `procedure.csv`
- `bom.csv`
- `bomLine.csv`
- `het.csv`
- `phase.csv`
- `phaseEquip.csv`
- `workOrder.csv`
- `woSerial.csv`
- `sterilise.csv`
- `printLabels.csv`

## CSV format

- The first row must contain the AppSheet column names (e.g., `woId`, `hetId`, `createdOn`).
- Comma-separated values.
- Date/time columns should be parseable by JavaScript `new Date()`.
- Boolean columns accept `yes`, `true`, `1`, `y` (case-insensitive).
- Many-to-many columns (e.g., `batchHetIds`, `phaseEquipIds`) should contain comma-separated IDs.

## Running the import

```bash
# Make sure the stack is up and migrations have been applied
cd deploy && make up
make db-migrate

# Import seed data
make db-import
```

Or run directly inside the backend container:

```bash
cd deploy
docker compose exec be npm run db:import
```

## Generating seed files from Google Sheets

When you connect Google, run the export script (to be provided) to generate these CSVs automatically. Until then, export each worksheet manually from Google Sheets as CSV.
