import { prisma } from '../db/prisma.js';
import { DEFAULT_TENANT_ID, tenantIdOrDefault } from '../services/tenant.js';

/**
 * Legacy-coherence backfill.
 *
 * Legacy AmGraft work orders import unwired: `workflowId`, `previousWoId`,
 * `nextPhaseId`, `releaseStatus` are NULL and the imported phases are keyless
 * and unbound. The post-#158 board is workflow + chain driven, so raw legacy
 * data shows nothing (and every work order looks open-ended — no end, nowhere
 * to go) until wired. This step retrofits the chain semantics so every work
 * order gains a terminal state and a forward destination:
 *
 *   1. attach orphan work orders to the workflow;
 *   2. attach every phase its work orders sit on to the workflow (phases are
 *      workflow-owned now via phase.workflowId), filling keyText from phaseShort;
 *   3. link each HET run A1->…->terminal via previousWoId / nextPhaseId
 *      (unique-safe: one work order per phase per HET);
 *   4. mark terminal finished runs `released` (final phase reached, prodEnd set);
 *   5. bridge finished-goods inventory lots to their run by
 *      lotNumber = terminal work order manuNumber (the LOT number).
 *
 * Idempotent — every write is guarded so re-running is a no-op. Mirrors the
 * statements validated against the staging database.
 */

export interface BackfillReport {
  startedAt: string;
  finishedAt?: string;
  tenantId: string;
  workflowCode: string;
  dryRun: boolean;
  totals: {
    ordersAttached: number;
    phasesBound: number;
    phasesKeyed: number;
    chainLinked: number;
    terminalReleased: number;
    finishedGoodsBridged: number;
  };
  openWorkOrders: number; // genuinely-incomplete runs: no next, not released
  warnings: string[];
}

function arg(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

export async function backfillLegacyCoherence(options: {
  tenantId?: string | null;
  workflowCode?: string;
  dryRun?: boolean;
}): Promise<BackfillReport> {
  const tenantId = tenantIdOrDefault(options.tenantId);
  const workflowCode = options.workflowCode ?? 'AMG';
  const dryRun = Boolean(options.dryRun);
  const report: BackfillReport = {
    startedAt: new Date().toISOString(),
    tenantId,
    workflowCode,
    dryRun,
    totals: {
      ordersAttached: 0,
      phasesBound: 0,
      phasesKeyed: 0,
      chainLinked: 0,
      terminalReleased: 0,
      finishedGoodsBridged: 0,
    },
    openWorkOrders: 0,
    warnings: [],
  };

  const workflow = await prisma.workflow.findFirst({
    where: { tenantId, code: workflowCode },
    select: { id: true },
  });
  if (!workflow) {
    report.warnings.push(`workflow ${workflowCode} not found for tenant ${tenantId}; nothing to do`);
    report.finishedAt = new Date().toISOString();
    return report;
  }
  const workflowId = workflow.id;

  await prisma.$transaction(async (tx) => {
    // 1. Attach orphan (unbound) work orders to the workflow. Legacy imports
    //    leave workflowId NULL; a single-line tenant routes them all here.
    report.totals.ordersAttached = await tx.$executeRaw`
      UPDATE "workOrder" SET "workflowId" = ${workflowId}
      WHERE "tenantId" = ${tenantId} AND "workflowId" IS NULL AND "deleted" = false`;

    // 2a. Key any blank phases by their step short-code so the KEY column and
    //     downstream lookups have a stable handle.
    report.totals.phasesKeyed = await tx.$executeRaw`
      UPDATE "phase" SET "keyText" = "phaseShort"
      WHERE "tenantId" = ${tenantId} AND "keyText" IS NULL AND "phaseShort" IS NOT NULL`;

    // 2b. Attach every phase a work order sits on to this workflow. Phases are
    //     workflow-owned now (phase.workflowId), set at import/seed, so no join
    //     table is involved. This is a safety net: any phase whose work order
    //     routes here but whose workflowId still points elsewhere gets rebound.
    //     Assumes a single production line per tenant (AMG); cross-workflow phase
    //     re-attachment is out of scope.
    report.totals.phasesBound = await tx.$executeRaw`
      UPDATE "phase" SET "workflowId" = ${workflowId}
      WHERE "tenantId" = ${tenantId} AND "workflowId" <> ${workflowId}
        AND "id" IN (
          SELECT DISTINCT o."phaseId" FROM "workOrder" o
          WHERE o."workflowId" = ${workflowId} AND o."tenantId" = ${tenantId}
            AND o."phaseId" IS NOT NULL AND o."deleted" = false
        )`;

    // 3. Chain each HET run: previousWoId = prior-phase work order,
    //    nextPhaseId = next phase. Unique-safe: one work order per phase per HET.
    report.totals.chainLinked = await tx.$executeRaw`
      WITH seq AS (
        SELECT id,
          lag(id) OVER w AS prev_wo,
          lead("phaseId") OVER w AS next_phase
        FROM "workOrder"
        WHERE "tenantId" = ${tenantId} AND "deleted" = false
          AND "hetId" IS NOT NULL AND "workflowId" = ${workflowId}
        WINDOW w AS (PARTITION BY "hetId" ORDER BY "phaseOrder")
      )
      UPDATE "workOrder" o
      SET "previousWoId" = seq.prev_wo, "nextPhaseId" = seq.next_phase
      FROM seq
      WHERE o.id = seq.id
        AND (seq.prev_wo IS DISTINCT FROM o."previousWoId"
             OR seq.next_phase IS DISTINCT FROM o."nextPhaseId")
        AND (seq.prev_wo IS NOT NULL OR seq.next_phase IS NOT NULL)`;

    // 4. Mark terminal finished runs released: the work order sits on the
    //    workflow's final phase (max sortOrder) and has finished production.
    report.totals.terminalReleased = await tx.$executeRaw`
      UPDATE "workOrder" o
      SET "releaseStatus" = 'released', "releaseDecisionAt" = o."prodEnd"
      WHERE o."tenantId" = ${tenantId} AND o."deleted" = false
        AND o."releaseStatus" IS NULL AND o."prodEnd" IS NOT NULL
        AND o."phaseId" = (
          SELECT p."id" FROM "phase" p
          WHERE p."workflowId" = ${workflowId}
          ORDER BY p."sortOrder" DESC, p."id" DESC LIMIT 1
        )`;

    // 5. Bridge finished-goods inventory lots to the run that produced them,
    //    keyed on lotNumber = terminal work order manuNumber (the LOT number).
    report.totals.finishedGoodsBridged = await tx.$executeRaw`
      UPDATE "inventoryLot" l
      SET "workOrderId" = o.id
      FROM "workOrder" o
      WHERE l."tenantId" = ${tenantId}
        AND l."inventoryType" = 'FINISHED_GOOD'
        AND l."deleted" = false AND l."workOrderId" IS NULL
        AND o."manuNumber" = l."lotNumber" AND o."deleted" = false
        AND o."phaseId" = (
          SELECT p."id" FROM "phase" p
          WHERE p."workflowId" = ${workflowId}
          ORDER BY p."sortOrder" DESC, p."id" DESC LIMIT 1
        )`;

    if (dryRun) {
      throw new DryRunRollback();
    }
  }).catch((err) => {
    if (!(err instanceof DryRunRollback)) throw err;
  });

  // Report genuinely-open work orders: no next phase, not released, not
  // superseded by a later work order on the same HET. These are real incomplete
  // runs, not a wiring gap — surfaced so they can be reviewed, not hidden.
  const openRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count FROM "workOrder" o
    WHERE o."tenantId" = ${tenantId} AND o."deleted" = false
      AND o."workflowId" = ${workflowId}
      AND o."nextPhaseId" IS NULL AND o."releaseStatus" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "workOrder" peer
        WHERE peer."hetId" = o."hetId" AND peer."phaseOrder" > o."phaseOrder" AND peer."deleted" = false
      )`;
  report.openWorkOrders = Number(openRows[0]?.count ?? 0n);

  report.finishedAt = new Date().toISOString();
  return report;
}

class DryRunRollback extends Error {}

// CLI entrypoint (mirrors syncHetInventory): `db:backfill:legacy-coherence`.
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillLegacyCoherence({
    tenantId: arg('tenant-id', DEFAULT_TENANT_ID),
    workflowCode: arg('workflow', 'AMG'),
    dryRun: flag('dry-run'),
  })
    .then((report) => {
      console.table(report.totals);
      console.log(`open (genuinely-incomplete) work orders: ${report.openWorkOrders}`);
      if (report.warnings.length) console.warn(`Warnings: ${report.warnings.join('; ')}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
