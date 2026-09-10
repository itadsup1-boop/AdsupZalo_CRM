import { prisma } from './src/shared/database/prisma-client.js';

async function test() {
  const count = await prisma.contact.count();
  console.log("Total contacts:", count);
}

test().catch(console.error).finally(() => prisma.$disconnect());
