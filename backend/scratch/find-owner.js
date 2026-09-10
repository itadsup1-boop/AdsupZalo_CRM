import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      orgId: 'b2db7caa-b9a0-4146-8d6e-c517987d6dcf',
      role: { in: ['owner', 'admin'] }
    },
    select: {
      email: true,
      role: true,
      fullName: true
    }
  });
  console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
