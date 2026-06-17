import { prisma } from '../src/db/prisma.js';

async function main() {
  // Seed placeholder admin user from environment or skip if staff already exists.
  const count = await prisma.staff.count();
  if (count === 0) {
    await prisma.staff.create({
      data: {
        email: 'admin@example.com',
        name: 'Admin User',
        // password: admin123 — will be replaced with proper seeding from Bitrix/CSV
        passwordHash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
      },
    });
    console.log('Seeded default admin user');
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
