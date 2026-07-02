import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import csv from 'csv-parser';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  buildStaffEmailMap,
  durationMinutesBetween,
  ensureLegacySigner,
  parseDurationToMinutes,
  resolveSignerId,
} from './legacyWorkOrderEvidence.js';

/**
 * Backfill the work-order MES evidence the AppSheet CSV import dropped (issue #116).
 *
 * The importCsv workOrder columnMap never mapped `startSign` / `endSign` /
 * `image`, mis-typed `prodDuration`, and left signer emails unresolved. As a
 * result all 1050 imported rows carry NULL signature paths, NULL photo, NULL
 * signer ids, and NULL cycle-time. This restores them from
 * `data/legacy/BOM-WO---workOrder.csv` without a full re-import.
 *
 * Restored per row (only where the DB column is currently NULL — never clobbers
 * anything the live app captured):
 *   - prodDuration : cycle-time KPI in minutes (from the legacy H:MM:SS value,
 *                    falling back to prodEnd - prodStart)
 *   - startSignById / endSignById : resolved from the legacy signer emails
 *   - startSignPath / endSignPath / imagePath : base64 data URLs (the app's
 *     native storage format) pulled from the Drive folder — only with --with-images
 *
 * Usage (run inside the backend container):
 *   tsx src/scripts/backfillWorkOrderEvidence.ts            # dry run, no images
 *   tsx src/scripts/backfillWorkOrderEvidence.ts --apply    # write metadata + KPI
 *   tsx src/scripts/backfillWorkOrderEvidence.ts --apply --with-images
 *
 * Flags:
 *   --apply           write changes (default: dry run, reports only)
 *   --with-images     also pull signature/photo bytes from Drive and inline them
 *   --create-missing-signers
 *                     create inactive staff stubs for departed operators whose
 *                     email is no longer in `staff`, so their sign-offs keep an
 *                     identity instead of dropping to NULL
 *   --csv=<path>      override CSV path
 *   --folder=<id>     override Drive folder id (default WO_IMAGES_FOLDER_ID env
 *                     or the AmGraft workOrder_Images folder)
 *   --limit=<n>       process only the first N CSV rows (for testing)
 *
 * Idempotent: re-running only fills columns that are still NULL.
 */

type Row = Record<string, string | undefined>;

const DEFAULT_FOLDER_ID = '1Q9nNInKvDYa0Kq0S0pweeSZIcSjMBPdN';

interface Args {
  apply: boolean;
  withImages: boolean;
  createMissingSigners: boolean;
  csvPath: string;
  folderId: string;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  // repo-root/data/legacy/... — script lives at be/src/scripts, so go up 3.
  const defaultCsv = path.resolve(scriptDir, '../../../data/legacy/BOM-WO---workOrder.csv');
  const args: Args = {
    apply: argv.includes('--apply'),
    withImages: argv.includes('--with-images'),
    createMissingSigners: argv.includes('--create-missing-signers'),
    csvPath: defaultCsv,
    folderId: process.env.WO_IMAGES_FOLDER_ID || DEFAULT_FOLDER_ID,
  };
  for (const a of argv) {
    if (a.startsWith('--csv=')) args.csvPath = a.slice('--csv='.length);
    else if (a.startsWith('--folder=')) args.folderId = a.slice('--folder='.length);
    else if (a.startsWith('--limit=')) {
      const n = Number(a.slice('--limit='.length));
      if (Number.isInteger(n) && n > 0) args.limit = n;
    }
  }
  return args;
}

function loadCsv(filePath: string): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const rows: Row[] = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data: Row) => rows.push(data))
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

function basename(driveRef: string | undefined): string | undefined {
  if (!driveRef) return undefined;
  const trimmed = driveRef.trim();
  if (!trimmed) return undefined;
  return trimmed.split('/').pop();
}

// ---- Drive access (only used with --with-images) ----

interface DriveFile {
  id: string;
  mimeType: string;
}

type DriveClient = Awaited<ReturnType<typeof initDrive>>;

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

async function initDrive() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set (needed for --with-images)');
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
  }
  const { google } = await import('googleapis');
  const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: DRIVE_SCOPES });
  return google.drive({ version: 'v3', auth });
}

async function listFolder(drive: DriveClient, folderId: string): Promise<Map<string, DriveFile>> {
  const map = new Map<string, DriveFile>();
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.name && f.id) map.set(f.name, { id: f.id, mimeType: f.mimeType || 'image/png' });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return map;
}

async function downloadAsDataUrl(drive: DriveClient, fileId: string, mimeType: string): Promise<string> {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  const buf = Buffer.from(res.data as ArrayBuffer);
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

// ---- Main ----

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.csvPath)) {
    throw new Error(`CSV not found: ${args.csvPath}`);
  }

  const mode = args.apply ? 'APPLY' : 'DRY RUN';
  console.log(`[backfill-wo-evidence] ${mode}${args.withImages ? ' + images' : ''}`);
  console.log(`[backfill-wo-evidence] csv: ${args.csvPath}`);

  let rows = await loadCsv(args.csvPath);
  if (args.limit) rows = rows.slice(0, args.limit);
  console.log(`[backfill-wo-evidence] csv rows: ${rows.length}`);

  const emailMap = await buildStaffEmailMap(prisma);

  // Load current DB state for the referenced work orders in one pass.
  const ids = rows.map((r) => (r.woId || '').trim()).filter(Boolean);
  const existing = await prisma.workOrder.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      prodStart: true,
      prodEnd: true,
      prodDuration: true,
      startSignById: true,
      endSignById: true,
      startSignPath: true,
      endSignPath: true,
      imagePath: true,
    },
  });
  const byId = new Map(existing.map((w) => [w.id, w]));

  // Drive folder listing (once) when pulling images.
  let drive: DriveClient | undefined;
  let driveFiles: Map<string, DriveFile> | undefined;
  if (args.withImages) {
    console.log(`[backfill-wo-evidence] listing Drive folder ${args.folderId} ...`);
    drive = await initDrive();
    driveFiles = await listFolder(drive, args.folderId);
    console.log(`[backfill-wo-evidence] Drive files found: ${driveFiles.size}`);
  }

  const stats = {
    matched: 0,
    unmatchedWoId: 0,
    durationFilled: 0,
    startSignerFilled: 0,
    endSignerFilled: 0,
    startImageFilled: 0,
    endImageFilled: 0,
    photoFilled: 0,
    unresolvedEmails: new Set<string>(),
    createdSigners: new Set<string>(),
    missingDriveFiles: 0,
  };

  // Resolve a signer email to a staff id, optionally creating an inactive stub
  // for a departed operator so their sign-off keeps an identity.
  async function resolveOrCreate(email: string | undefined): Promise<string | undefined> {
    const direct = resolveSignerId(email, emailMap);
    if (direct) return direct;
    if (!email?.trim()) return undefined;
    if (args.createMissingSigners) {
      stats.createdSigners.add(email.trim().toLowerCase());
      // Only write the stub when applying; in dry run just report the intent.
      return args.apply ? ensureLegacySigner(email, emailMap, prisma) : 'dry-run-stub';
    }
    stats.unresolvedEmails.add(email.trim().toLowerCase());
    return undefined;
  }

  for (const row of rows) {
    const id = (row.woId || '').trim();
    if (!id) continue;
    const wo = byId.get(id);
    if (!wo) {
      stats.unmatchedWoId += 1;
      continue;
    }
    stats.matched += 1;

    const patch: Record<string, unknown> = {};

    // --- prodDuration (KPI) ---
    if (wo.prodDuration === null || wo.prodDuration === undefined) {
      const minutes =
        parseDurationToMinutes(row.prodDuration) ?? durationMinutesBetween(wo.prodStart, wo.prodEnd);
      if (minutes !== undefined) {
        patch.prodDuration = minutes;
        stats.durationFilled += 1;
      }
    }

    // --- signer ids ---
    if (!wo.startSignById && row.startSignBy) {
      const sid = await resolveOrCreate(row.startSignBy);
      if (sid) {
        if (args.apply) patch.startSignById = sid;
        stats.startSignerFilled += 1;
      }
    }
    if (!wo.endSignById && row.endSignBy) {
      const sid = await resolveOrCreate(row.endSignBy);
      if (sid) {
        if (args.apply) patch.endSignById = sid;
        stats.endSignerFilled += 1;
      }
    }

    // --- images (base64 data URLs, only with --with-images) ---
    if (args.withImages && driveFiles) {
      const imageTargets: Array<{ col: 'startSignPath' | 'endSignPath' | 'imagePath'; ref?: string; counter: 'startImageFilled' | 'endImageFilled' | 'photoFilled' }> = [
        { col: 'startSignPath', ref: row.startSign, counter: 'startImageFilled' },
        { col: 'endSignPath', ref: row.endSign, counter: 'endImageFilled' },
        { col: 'imagePath', ref: row.image, counter: 'photoFilled' },
      ];
      for (const t of imageTargets) {
        if (wo[t.col]) continue; // already has a value
        const name = basename(t.ref);
        if (!name) continue;
        const file = driveFiles.get(name);
        if (!file) {
          stats.missingDriveFiles += 1;
          continue;
        }
        // Downloading is the expensive part; only do it when applying.
        if (args.apply && drive) {
          patch[t.col] = await downloadAsDataUrl(drive, file.id, file.mimeType);
        }
        stats[t.counter] += 1;
      }
    }

    if (args.apply && Object.keys(patch).length > 0) {
      await prisma.workOrder.update({ where: { id }, data: patch as Prisma.WorkOrderUncheckedUpdateInput });
    }
  }

  console.log('\n[backfill-wo-evidence] summary');
  console.log(`  matched work orders     : ${stats.matched}`);
  console.log(`  unmatched woId (skipped): ${stats.unmatchedWoId}`);
  console.log(`  prodDuration filled     : ${stats.durationFilled}`);
  console.log(`  start signer filled     : ${stats.startSignerFilled}`);
  console.log(`  end signer filled       : ${stats.endSignerFilled}`);
  if (args.withImages) {
    console.log(`  start-sign images       : ${stats.startImageFilled}`);
    console.log(`  end-sign images         : ${stats.endImageFilled}`);
    console.log(`  photo evidence images   : ${stats.photoFilled}`);
    console.log(`  drive files not found   : ${stats.missingDriveFiles}`);
  }
  if (stats.createdSigners.size) {
    const verb = args.apply ? 'created inactive stubs for' : 'would create stubs for';
    console.log(`  legacy signers ${verb}: ${[...stats.createdSigners].join(', ')}`);
  }
  if (stats.unresolvedEmails.size) {
    console.log(`  UNRESOLVED signer emails (dropped to NULL): ${[...stats.unresolvedEmails].join(', ')}`);
    console.log('    -> re-run with --create-missing-signers to preserve these sign-offs.');
  }
  if (!args.apply) {
    console.log('\n  DRY RUN — no rows written. Re-run with --apply to persist.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
