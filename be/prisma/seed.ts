import { prisma } from '../src/db/prisma.js';

async function seedRoles() {
  const roles = [
    { key: 'owner', name: 'Owner', description: 'Full access. Can manage roles and other owners.', builtIn: true, sortOrder: 1 },
    { key: 'admin', name: 'Admin', description: 'Can manage users and data, but not roles.', builtIn: true, sortOrder: 2 },
    { key: 'user', name: 'User', description: 'Standard user with limited access.', builtIn: true, sortOrder: 3 },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: {},
      create: role,
    });
  }

  return prisma.role.findMany();
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
      data: { roleId: ownerRoleId },
    });
    console.log('Owner user already exists; role ensured');
    return;
  }

  await prisma.staff.create({
    data: {
      email: ownerEmail,
      name: 'System Owner',
      passwordHash: bcrypt.hashSync(ownerPassword, 12),
      roleId: ownerRoleId,
      active: true,
    },
  });
  console.log('Seeded owner user');
}

async function main() {
  const roles = await seedRoles();
  const ownerRole = roles.find((r) => r.key === 'owner');
  if (!ownerRole) {
    throw new Error('Owner role not found after seed');
  }

  await seedOwner(ownerRole.id);

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
