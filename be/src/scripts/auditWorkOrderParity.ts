import { prisma } from '../db/prisma.js';
import { listWorkOrders } from '../services/workOrderService.js';

async function main() {
  const workOrders = await listWorkOrders();
  const bucketCounts = new Map<string, number>();
  const missingRequirementCounts = new Map<string, number>();
  let canAdvanceLegacy = 0;

  for (const workOrder of workOrders) {
    bucketCounts.set(workOrder.legacyStateBucket, (bucketCounts.get(workOrder.legacyStateBucket) ?? 0) + 1);
    if (workOrder.canAdvanceLegacy) canAdvanceLegacy += 1;

    for (const requirement of workOrder.missingAdvanceRequirements) {
      missingRequirementCounts.set(requirement, (missingRequirementCounts.get(requirement) ?? 0) + 1);
    }
  }

  console.log('Work order parity audit');
  console.log(`Total non-deleted work orders: ${workOrders.length}`);
  console.log(`AppSheet next-phase eligible: ${canAdvanceLegacy}`);
  console.log('');
  console.log('Legacy productionState buckets:');
  for (const bucket of ['1. In Progress', '2. Next Phase', '3. In Quarantine', '4. Finished Goods', '5. WO Completed']) {
    console.log(`  ${bucket}: ${bucketCounts.get(bucket) ?? 0}`);
  }
  console.log('');
  console.log('Missing next-phase requirements:');
  for (const [requirement, count] of Array.from(missingRequirementCounts.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${requirement}: ${count}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
