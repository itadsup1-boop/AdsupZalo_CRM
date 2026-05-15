import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.message.findMany({
    where: {
      content: { contains: 'em chào c Mai ạ' }
    },
    orderBy: { sentAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(messages, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
