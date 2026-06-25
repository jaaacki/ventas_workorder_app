/**
 * exportGoogleSheet.ts — D2 of issue #36.
 *
 * Reads every worksheet the importer expects from the legacy `BOM_WO`
 * Google Sheet and writes RFC4180 CSVs to a timestamped archive dir,
 * alongside a `manifest.json` that the import contract can diff against.
 *
 * Single source of truth for the worksheet list is `tableConfigs` from
 * `importCsv.ts` — adding a new entry there makes this script export it.
 *
 * Special cases:
 *   - `printLabels.csv` is a Google Drive folder, NOT a Sheet worksheet.
 *     We skip it here with a manifest entry; the importer still expects
 *     the file to exist (out of scope for D2).
 *   - Date columns: GAP-5 — AppSheet exports dates in human format.
 *     The current `dateValue()` in importCsv.ts uses `new Date(str)`;
 *     this works for ISO but not for AppSheet's default formats. PR#2
 *     will harden the date parser. PR#1 produces CSVs that may yield
 *     null dates for some legacy rows — documented in the PR.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { google } from 'googleapis';
import { tableConfigs } from './importCsv.js';

const SHEET_ID_ENV = 'BOM_WO_SHEET_ID';

interface ManifestFile {
  fileName: string;
  worksheet: string;
  rows: number;
  bytes: number;
  sha256: string;
  status: 'ok' | 'skipped' | 'failed';
  reason?: string;
}

interface Manifest {
  sheetId: string;
  sheetTitle?: string;
  exportedAt: string;
  exporter: { script: string; node: string };
  files: ManifestFile[];
}

function parseServiceAccount(raw: string): {
  client_email: string;
  private_key: string;
  [k: string]: unknown;
} {
  const parsed = JSON.parse(raw);
  if (typeof parsed.private_key !== 'string' || typeof parsed.client_email !== 'string') {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }
  return parsed;
}

function sha256OfFile(p: string): string {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

/** RFC4180 quoting — quote only when needed, double inner quotes. */
function csvField(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

function utcStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function main() {
  const sheetId = process.env[SHEET_ID_ENV];
  if (!sheetId) {
    throw new Error(`Missing env var ${SHEET_ID_ENV} (the BOM_WO Google Sheet ID)`);
  }
  const credsRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credsRaw) {
    throw new Error('Missing env var GOOGLE_SERVICE_ACCOUNT_JSON');
  }
  const creds = parseServiceAccount(credsRaw);

  const exportDir = process.env.EXPORT_DIR
    ?? path.join('/app/scripts/seed_data', 'exports', utcStamp());
  fs.mkdirSync(exportDir, { recursive: true });

  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Get sheet metadata for the title
  let sheetTitle: string | undefined;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    sheetTitle = meta.data.properties?.title ?? undefined;
  } catch (e) {
    console.warn(`Could not fetch sheet metadata: ${(e as Error).message}`);
  }

  const manifest: Manifest = {
    sheetId,
    sheetTitle,
    exportedAt: new Date().toISOString(),
    exporter: { script: 'exportGoogleSheet.ts', node: process.version },
    files: [],
  };

  for (const config of tableConfigs) {
    const fileName = config.fileName;
    // fileName is like 'workOrder.csv' or 'printLabels.csv'.
    // The Google Sheet worksheet name strips the .csv extension.
    const worksheet = fileName.replace(/\.csv$/, '');
    const outPath = path.join(exportDir, fileName);

    // Special-case: printLabels is a Google Drive folder, not a worksheet.
    if (fileName === 'printLabels.csv') {
      console.warn(`[skip] ${fileName}: Google Drive folder, not a Sheet worksheet`);
      manifest.files.push({
        fileName,
        worksheet,
        rows: 0,
        bytes: 0,
        sha256: '',
        status: 'skipped',
        reason: 'Google Drive folder table; export handled separately',
      });
      continue;
    }

    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `'${worksheet}'`,
        valueRenderOption: 'FORMATTED_VALUE', // GAP-5: human-format dates for now
      });
      const rows = res.data.values ?? [];
      const csv = rowsToCsv(rows);
      fs.writeFileSync(outPath, csv, 'utf8');
      const stat = fs.statSync(outPath);
      const sha = sha256OfFile(outPath);
      console.log(`[ok]   ${fileName}: ${rows.length} rows, ${stat.size} bytes`);
      manifest.files.push({
        fileName,
        worksheet,
        rows: rows.length,
        bytes: stat.size,
        sha256: sha,
        status: 'ok',
      });
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[fail] ${fileName}: ${msg}`);
      // Write an empty CSV with just the header (from columnMap keys) so the
      // importer doesn't fail looking for the file. Better than a missing file.
      const header = Object.keys(config.columnMap);
      fs.writeFileSync(outPath, rowsToCsv([header]), 'utf8');
      manifest.files.push({
        fileName,
        worksheet,
        rows: 1, // header only
        bytes: fs.statSync(outPath).size,
        sha256: sha256OfFile(outPath),
        status: 'failed',
        reason: msg,
      });
    }
  }

  const manifestPath = path.join(exportDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\nManifest: ${manifestPath}`);
  console.log(`Exported ${manifest.files.filter((f) => f.status === 'ok').length}/${manifest.files.length} worksheets to ${exportDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});