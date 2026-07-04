import { prisma } from '../src/db/prisma.js';
import { ALL_OPERATIONAL_PERMISSIONS, ROLE_PERMISSION_KEYS } from '../src/auth/permissions.js';
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME, DEFAULT_TENANT_SLUG } from '../src/services/tenant.js';

async function seedTenant() {
  return prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: { name: DEFAULT_TENANT_NAME, active: true },
    create: {
      id: DEFAULT_TENANT_ID,
      slug: DEFAULT_TENANT_SLUG,
      name: DEFAULT_TENANT_NAME,
      active: true,
    },
  });
}

async function seedRoles() {
  const roles = [
    { key: 'owner', name: 'Owner', description: 'Full access. Can manage roles and other owners.', builtIn: true, sortOrder: 1 },
    { key: 'admin', name: 'Admin', description: 'Can manage users and data, but not roles.', builtIn: true, sortOrder: 2 },
    { key: 'production_manager', name: 'Production Manager', description: 'Can coordinate production-facing procurement and inventory actions.', builtIn: true, sortOrder: 3 },
    { key: 'procurement_manager', name: 'Procurement Manager', description: 'Can manage procurement records and read inventory context.', builtIn: true, sortOrder: 4 },
    { key: 'inventory_manager', name: 'Inventory Manager', description: 'Can manage inventory records and read procurement context.', builtIn: true, sortOrder: 5 },
    { key: 'qa_manager', name: 'QA Manager', description: 'Can review procurement and inventory records with limited QA corrections.', builtIn: true, sortOrder: 6 },
    { key: 'operator', name: 'Operator', description: 'Can read operational records and perform explicitly allowed production actions.', builtIn: true, sortOrder: 7 },
    { key: 'viewer', name: 'Viewer', description: 'Read-only access to operational records.', builtIn: true, sortOrder: 8 },
    { key: 'user', name: 'User', description: 'Legacy read-only user role.', builtIn: true, sortOrder: 9 },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: {
        name: role.name,
        description: role.description,
        builtIn: role.builtIn,
        sortOrder: role.sortOrder,
      },
      create: role,
    });
  }

  return prisma.role.findMany();
}

async function seedPermissions() {
  for (const permission of ALL_OPERATIONAL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
      create: permission,
    });
  }

  const [roles, permissions] = await Promise.all([prisma.role.findMany(), prisma.permission.findMany()]);
  const rolesByKey = new Map(roles.map((role) => [role.key, role]));
  const permissionsByKey = new Map(permissions.map((permission) => [permission.key, permission]));

  for (const [roleKey, permissionKeys] of Object.entries(ROLE_PERMISSION_KEYS)) {
    const role = rolesByKey.get(roleKey);
    if (!role) continue;

    const desiredPermissionIds = new Set<string>();
    for (const permissionKey of permissionKeys) {
      const permission = permissionsByKey.get(permissionKey);
      if (!permission) continue;
      desiredPermissionIds.add(permission.id);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: role.id,
        permissionId: { notIn: [...desiredPermissionIds] },
      },
    });
  }
}

async function seedOwner(ownerRoleId: string) {
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (!ownerEmail || !ownerPassword) {
    console.log('OWNER_EMAIL and/or OWNER_PASSWORD not set; skipping owner seed');
    return;
  }

  const bcrypt = await import('bcryptjs');
  const existing = await prisma.staff.findUnique({ where: { email: ownerEmail } });
  if (existing) {
    await prisma.staff.update({
      where: { id: existing.id },
      data: { roleId: ownerRoleId, tenantId: DEFAULT_TENANT_ID },
    });
    console.log('Owner user already exists; role ensured');
    return;
  }

  await prisma.staff.create({
    data: {
      email: ownerEmail,
      name: 'System Owner',
      passwordHash: bcrypt.hashSync(ownerPassword, 12),
      tenantId: DEFAULT_TENANT_ID,
      roleId: ownerRoleId,
      active: true,
    },
  });
  console.log('Seeded owner user');
}

// Canonical AmGraft phase → BOM name, from the legacy production sheet. Phases
// not listed (E17, E18, G24, G25/26, H27, H28) legitimately carry no BOM.
const AMG_PHASE_BOM: Record<string, string> = {
  A1: 'BOM A1',
  A2: 'BOM A2',
  'A3, A4, A5': 'BOM A3',
  'B6, B7, B8': 'BOM B1',
  'B9, B10, B11': 'BOM B2',
  C12: 'BOM C1',
  'D13, D14, D15, D16': 'BOM D1',
  F19: 'BOM F1',
  'F20, F21, F22': 'BOM F2',
  G23: 'BOM G1',
};

// Fill any NULL phase.bomId by matching phaseShort → BOM name against the
// imported BOM catalog. Idempotent (touches only NULLs), so it wires legacy BOMs
// onto the seed-created phases on a later deploy without disturbing existing
// bindings; a no-op on a fresh DB that has no BOMs imported yet.
async function bindPhaseBoms(workflowId: string): Promise<number> {
  const phases = await prisma.phase.findMany({
    where: { workflowId, bomId: null },
    select: { id: true, phaseShort: true },
  });
  let bound = 0;
  for (const phase of phases) {
    const bomName = phase.phaseShort ? AMG_PHASE_BOM[phase.phaseShort] : undefined;
    if (!bomName) continue;
    const bom = await prisma.bom.findFirst({
      where: { tenantId: DEFAULT_TENANT_ID, bomName },
      select: { id: true },
    });
    if (!bom) continue;
    await prisma.phase.update({ where: { id: phase.id }, data: { bomId: bom.id } });
    bound += 1;
  }
  return bound;
}

// Canonical AmGraft BOM material -> InventorySku sku code (epic #181, confident
// matches only). BOM and Inventory were separate legacy systems; this wires the
// same real item across them. Unlisted materials (reagents/waters/labels) stay
// unlinked for manual mapping.
const AMG_BOMLINE_SKU: Record<string, string> = {
  Ethanol: 'ENT-PRA-CNN-5LL-GER-BCM',
  'Tungsten carbide bur': 'TCB-PRA-PII-1PP-NCO-KTE',
  'Aluminium cake tray (round)': 'ACT-SCN-PCC-1PC-NCO-AAD',
  'PETG packaging tray (inner)': 'IPT-PAK-PCC-5PS-NCO-PTT',
  'PETG outer tray': 'OPT-PAK-PCC-7PE-NCO-PTT',
  'Tyvek lid (inner)': 'TLF-PAK-PCC-5PE-NCO-AMC',
  'Tyvek lid (outer)': 'TLO-PAK-PCC-2PI-NCO-AMC',
  'Sterile sample container': 'SSC-SCN-BTT-1UN-NCO-PME',
  'Sterile bag': 'SBP-SCN-BAA-4PC-NCO-HCC',
};

// Fill any NULL bomLine.inventorySkuId by matching description -> SKU code against
// the imported inventory catalog. Idempotent (NULL only), so it wires the links on
// a later deploy without disturbing manual edits; a no-op on a DB with no inventory.
async function bindBomLineSkus(): Promise<number> {
  let bound = 0;
  for (const [description, skuCode] of Object.entries(AMG_BOMLINE_SKU)) {
    const sku = await prisma.inventorySku.findFirst({
      where: { tenantId: DEFAULT_TENANT_ID, sku: skuCode, deleted: false },
      select: { id: true },
    });
    if (!sku) continue;
    const res = await prisma.bomLine.updateMany({
      where: { tenantId: DEFAULT_TENANT_ID, deleted: false, inventorySkuId: null, description },
      data: { inventorySkuId: sku.id },
    });
    bound += res.count;
  }
  return bound;
}

async function seedAmGraftWorkflow() {
  // Real AmGraft A–H production recipe. Each phase (letter group) owns an
  // ordered set of steps. isGate marks the sterilisation/BET gate; blocksCombine
  // forbids running the phase on a combined (multi-HET) batch.
  const recipe: Array<{
    phaseShort: string;
    phaseName: string;
    isGate?: boolean;
    blocksCombine?: boolean;
    steps: Array<{ code: string; name: string }>;
  }> = [
    // The canonical AmGraft phase grouping mirrors the legacy production sheet:
    // 16 phases, each grouping 1+ consecutive steps. phaseShort is the grouped
    // step codes; a work order sits on a phase. blocksCombine covers the pre-mill
    // steps (before C12); isGate covers the EtO/BET sterilisation gates.
    { phaseShort: 'A1', phaseName: 'HET Collection', blocksCombine: true, steps: [{ code: 'A1', name: 'HET Collection' }] },
    { phaseShort: 'A2', phaseName: 'HET Transfer', blocksCombine: true, steps: [{ code: 'A2', name: 'HET Transfer' }] },
    {
      phaseShort: 'A3, A4, A5',
      phaseName: 'Retrieve, Decoronate, Split Root',
      blocksCombine: true,
      steps: [
        { code: 'A3', name: 'Retrieve' },
        { code: 'A4', name: 'Decoronate' },
        { code: 'A5', name: 'Split Root' },
      ],
    },
    {
      phaseShort: 'B6, B7, B8',
      phaseName: 'Washing',
      blocksCombine: true,
      steps: [
        { code: 'B6', name: 'Washing' },
        { code: 'B7', name: 'Washing' },
        { code: 'B8', name: 'Washing' },
      ],
    },
    {
      phaseShort: 'B9, B10, B11',
      phaseName: 'Burring, Washing, Autoclave',
      blocksCombine: true,
      steps: [
        { code: 'B9', name: 'Burring' },
        { code: 'B10', name: 'Washing' },
        { code: 'B11', name: 'Autoclave' },
      ],
    },
    { phaseShort: 'C12', phaseName: 'Milling & Sieving', steps: [{ code: 'C12', name: 'Milling & Sieving' }] },
    {
      phaseShort: 'D13, D14, D15, D16',
      phaseName: 'Cleaning',
      steps: [
        { code: 'D13', name: 'Cleaning' },
        { code: 'D14', name: 'Cleaning' },
        { code: 'D15', name: 'Cleaning' },
        { code: 'D16', name: 'Cleaning' },
      ],
    },
    { phaseShort: 'E17', phaseName: 'Freezing', steps: [{ code: 'E17', name: 'Freezing' }] },
    { phaseShort: 'E18', phaseName: 'Lyophilising', steps: [{ code: 'E18', name: 'Lyophilising' }] },
    { phaseShort: 'F19', phaseName: 'Dispenser', steps: [{ code: 'F19', name: 'Dispenser' }] },
    {
      phaseShort: 'F20, F21, F22',
      phaseName: 'Sealing & Send Out',
      steps: [
        { code: 'F20', name: 'Sealing Inner' },
        { code: 'F21', name: 'Sealing Outer' },
        { code: 'F22', name: 'Send Out' },
      ],
    },
    { phaseShort: 'G23', phaseName: 'Pack for Terminal Sterilisation', steps: [{ code: 'G23', name: 'Packing for EtO' }] },
    { phaseShort: 'G24', phaseName: 'EtO Sterilisation', isGate: true, steps: [{ code: 'G24', name: 'Terminal Sterilisation (EtO)' }] },
    {
      phaseShort: 'G25, G26',
      phaseName: 'BET Test & Final QC',
      isGate: true,
      steps: [
        { code: 'G25', name: 'BET Test' },
        { code: 'G26', name: 'Pass/Fail Handling' },
      ],
    },
    { phaseShort: 'H27', phaseName: 'Labelling & Verification', steps: [{ code: 'H27', name: 'Labelling & Verification' }] },
    { phaseShort: 'H28', phaseName: 'Release to Inventory', steps: [{ code: 'H28', name: 'Release to Inventory' }] },
  ];

  const workflow = await prisma.workflow.upsert({
    where: { tenantId_code: { tenantId: DEFAULT_TENANT_ID, code: 'AMG' } },
    update: {
      tenantId: DEFAULT_TENANT_ID,
      name: 'AmGraft',
      description: 'AmGraft® tissue-engineered dental graft manufacturing workflow.',
    },
    create: {
      id: 'workflow-amg',
      tenantId: DEFAULT_TENANT_ID,
      name: 'AmGraft',
      code: 'AMG',
      description: 'AmGraft® tissue-engineered dental graft manufacturing workflow.',
      active: true,
    },
  });

  // Only seed the demo A–H recipe on a fresh workflow. Once a workflow has
  // phases (seeded once, or later edited in the configurator), leave them
  // intact — otherwise every deploy would wipe the real phases and re-hide the
  // board behind a freshly-seeded recipe.
  const existingPhases = await prisma.phase.count({ where: { workflowId: workflow.id } });
  if (existingPhases > 0) {
    console.log(`AmGraft workflow (${workflow.code}) already has ${existingPhases} phases; leaving them intact`);
    const bound = await bindPhaseBoms(workflow.id);
    if (bound > 0) console.log(`Bound ${bound} phase BOM(s) to existing AmGraft phases`);
    const skuBound = await bindBomLineSkus();
    if (skuBound > 0) console.log(`Linked ${skuBound} BOM line(s) to inventory SKUs`);
    return workflow;
  }

  // One transaction so a mid-loop failure can't strand a partial recipe that the
  // `existingPhases > 0` guard above would then skip forever.
  let stepCount = 0;
  await prisma.$transaction(async (tx) => {
    for (let phaseIndex = 0; phaseIndex < recipe.length; phaseIndex += 1) {
      const group = recipe[phaseIndex];
      const phase = await tx.phase.create({
        data: {
          tenantId: DEFAULT_TENANT_ID,
          workflowId: workflow.id,
          sortOrder: phaseIndex,
          phaseShort: group.phaseShort,
          phaseName: group.phaseName,
          isGate: group.isGate ?? false,
          blocksCombine: group.blocksCombine ?? false,
          keyText: `AMG:${group.phaseShort}`,
        },
      });
      for (let stepIndex = 0; stepIndex < group.steps.length; stepIndex += 1) {
        const step = group.steps[stepIndex];
        await tx.step.create({
          data: {
            tenantId: DEFAULT_TENANT_ID,
            workflowId: workflow.id,
            phaseId: phase.id,
            sortOrder: stepIndex,
            code: step.code,
            name: step.name,
            keyText: `AMG:${step.code}`,
          },
        });
        stepCount += 1;
      }
    }
  });

  const bound = await bindPhaseBoms(workflow.id);
  const skuBound = await bindBomLineSkus();
  console.log(`Seeded AmGraft workflow (${workflow.code}) with ${recipe.length} phases, ${stepCount} steps, ${bound} BOM binding(s), ${skuBound} SKU link(s)`);
  return workflow;
}

async function main() {
  await seedTenant();
  const roles = await seedRoles();
  await seedPermissions();
  const ownerRole = roles.find((r) => r.key === 'owner');
  if (!ownerRole) {
    throw new Error('Owner role not found after seed');
  }

  await seedOwner(ownerRole.id);
  await seedAmGraftWorkflow();

  // Backfill any staff without a role to the default user role.
  const userRole = roles.find((r) => r.key === 'user');
  if (userRole) {
    await prisma.staff.updateMany({
      where: { roleId: null },
      data: { roleId: userRole.id },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
