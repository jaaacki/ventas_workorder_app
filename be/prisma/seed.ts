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

async function seedAmGraftWorkflow() {
  // Real AmGraft A–H production recipe. Each phase (letter group) owns an
  // ordered set of steps. phaseShort is the letter; phaseName is the group.
  // isGate marks the sterilisation/BET gate; blocksCombine forbids running the
  // phase on a combined (multi-HET) batch.
  const recipe: Array<{
    phaseShort: string;
    phaseName: string;
    isGate?: boolean;
    blocksCombine?: boolean;
    steps: Array<{ code: string; name: string }>;
  }> = [
    {
      phaseShort: 'A',
      phaseName: 'Material Acquisition',
      blocksCombine: true,
      steps: [
        { code: 'A1', name: 'HET Collection' },
        { code: 'A2', name: 'HET Transfer' },
        { code: 'A3', name: 'Retrieve' },
        { code: 'A4', name: 'Decoronate' },
        { code: 'A5', name: 'Split Root' },
      ],
    },
    {
      phaseShort: 'B',
      phaseName: 'Cleaning & Disinfection',
      blocksCombine: true,
      steps: [
        { code: 'B6', name: 'Washing' },
        { code: 'B7', name: 'Washing' },
        { code: 'B8', name: 'Washing' },
        { code: 'B9', name: 'Burring' },
        { code: 'B10', name: 'Washing' },
        { code: 'B11', name: 'Autoclave' },
      ],
    },
    {
      phaseShort: 'C',
      phaseName: 'Material Processing',
      steps: [{ code: 'C12', name: 'Milling & Sieving' }],
    },
    {
      phaseShort: 'D',
      phaseName: 'Cleaning II',
      steps: [
        { code: 'D13', name: 'Cleaning' },
        { code: 'D14', name: 'Cleaning' },
        { code: 'D15', name: 'Cleaning' },
        { code: 'D16', name: 'Cleaning' },
      ],
    },
    {
      phaseShort: 'E',
      phaseName: 'Preservation',
      steps: [
        { code: 'E17', name: 'Freezing' },
        { code: 'E18', name: 'Lyophilising' },
      ],
    },
    {
      phaseShort: 'F',
      phaseName: 'Packaging',
      steps: [
        { code: 'F19', name: 'Dispenser' },
        { code: 'F20', name: 'Sealing Inner' },
        { code: 'F21', name: 'Sealing Outer' },
        { code: 'F22', name: 'Send Out' },
      ],
    },
    {
      phaseShort: 'G',
      phaseName: 'QC & Sterilisation',
      isGate: true,
      steps: [
        { code: 'G23', name: 'Packing for EtO' },
        { code: 'G24', name: 'Terminal Sterilisation (EtO)' },
        { code: 'G25', name: 'BET Test' },
        { code: 'G26', name: 'Pass/Fail Handling' },
      ],
    },
    {
      phaseShort: 'H',
      phaseName: 'Finalisation',
      steps: [
        { code: 'H27', name: 'Labelling & Verification' },
        { code: 'H28', name: 'Release to Inventory' },
      ],
    },
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
    return workflow;
  }

  let stepCount = 0;
  for (let phaseIndex = 0; phaseIndex < recipe.length; phaseIndex += 1) {
    const group = recipe[phaseIndex];
    const phase = await prisma.phase.create({
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
      await prisma.step.create({
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

  console.log(`Seeded AmGraft workflow (${workflow.code}) with ${recipe.length} phases and ${stepCount} steps`);
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
