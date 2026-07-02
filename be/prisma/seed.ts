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
  // Ordered AmGraft manufacturing phases, derived from
  // docs/CORE_ESSENCE.md section 3 (preparation -> production ->
  // sterilisation/BET gate -> finish/release).
  const phases = [
    { phaseName: 'Preparation', phaseShort: 'PREP' },
    { phaseName: 'Production', phaseShort: 'PROD' },
    { phaseName: 'Sterilisation', phaseShort: 'STER' },
    { phaseName: 'BET Verification', phaseShort: 'BET' },
    { phaseName: 'Release', phaseShort: 'REL' },
  ];

  const workflow = await prisma.workflow.upsert({
    where: { tenantId_code: { tenantId: DEFAULT_TENANT_ID, code: 'AMG' } },
    update: { tenantId: DEFAULT_TENANT_ID },
    create: {
      id: 'workflow-amg',
      tenantId: DEFAULT_TENANT_ID,
      name: 'AmGraft',
      code: 'AMG',
      description: 'AmGraft® tissue-engineered dental graft manufacturing workflow.',
      active: true,
    },
  });

  // Upsert each Phase with a stable id. Phase.id is `String @id` with no
  // default, so we supply an explicit id (and matching keyText).
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    const phaseId = `AMG:${phase.phaseName}`;
    await prisma.phase.upsert({
      where: { id: phaseId },
      update: {
        tenantId: DEFAULT_TENANT_ID,
        phaseName: phase.phaseName,
        phaseShort: phase.phaseShort,
        phaseOrder: index,
        keyText: phaseId,
      },
      create: {
        id: phaseId,
        tenantId: DEFAULT_TENANT_ID,
        phaseName: phase.phaseName,
        phaseShort: phase.phaseShort,
        phaseOrder: index,
        keyText: phaseId,
      },
    });
  }

  // Bind phases to the AMG workflow via WorkflowPhase. Idempotent: clear
  // existing bindings for this workflow then re-create them in order.
  await prisma.workflowPhase.deleteMany({
    where: { workflowId: workflow.id },
  });
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    await prisma.workflowPhase.create({
      data: {
        workflowId: workflow.id,
        phaseId: `AMG:${phase.phaseName}`,
        sortOrder: index,
      },
    });
  }

  console.log(`Seeded AmGraft workflow (${workflow.code}) with ${phases.length} phases`);
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
