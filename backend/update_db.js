const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
async function run() {
  await prisma.aiConfig.updateMany({
    where: { model: 'qwen2.5:3b' },
    data: { model: 'gemma3:4b' }
  });
  console.log('Updated DB');
}
run().catch(console.error).finally(() => prisma.$disconnect());
