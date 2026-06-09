import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ where: { role: 'owner' } });
  console.table(users.map(u => ({ id: u.id, email: u.email, fullName: u.fullName })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
