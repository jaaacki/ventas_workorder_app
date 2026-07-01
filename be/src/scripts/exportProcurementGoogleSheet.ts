import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

const DEFAULT_PROCUREMENT_SHEET_ID = '14uvxUpt-FqIY3YdgmiP9tT8hphkN_SHN-Ajj3YpxqEY';
const SHEET_ID_ENV = 'PROCUREMENT_SHEET_ID';

const worksheets = [
  { worksheet: 'clinicDb', fileName: 'HETDeliveryReturnRecords---clinicDb.csv' },
  { worksheet: 'deliverCollect', fileName: 'HETDeliveryReturnRecords---deliverCollect.csv' },
  { worksheet: 'HETLot-TODEL', fileName: 'HETDeliveryReturnRecords---HETLot-TODEL.csv' },
];

function arg(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
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

function csvField(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export async function exportProcurementGoogleSheet(options: {
  sheetId?: string;
  outputDir?: string;
}) {
  const credsRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credsRaw) throw new Error('Missing env var GOOGLE_SERVICE_ACCOUNT_JSON');

  const outputDir = options.outputDir ?? process.env.PROCUREMENT_CSV_DIR ?? path.resolve(process.cwd(), 'data/legacy');
  const sheetId = options.sheetId ?? process.env[SHEET_ID_ENV] ?? DEFAULT_PROCUREMENT_SHEET_ID;
  fs.mkdirSync(outputDir, { recursive: true });

  const creds = parseServiceAccount(credsRaw);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const exported: Array<{ worksheet: string; fileName: string; rows: number }> = [];
  for (const item of worksheets) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${item.worksheet}'`,
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const rows = res.data.values ?? [];
    fs.writeFileSync(path.join(outputDir, item.fileName), rowsToCsv(rows), 'utf8');
    exported.push({ ...item, rows: rows.length });
    console.log(`[ok] ${item.fileName}: ${rows.length} rows`);
  }

  return { sheetId, outputDir, exported };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  exportProcurementGoogleSheet({
    sheetId: arg('sheet-id'),
    outputDir: arg('output-dir'),
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
