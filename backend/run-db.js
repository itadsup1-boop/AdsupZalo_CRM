import { PrismaClient } from '/app/node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();

async function run() {
  const campaigns = await prisma.campaign.findMany({
    include: { scenario: true }
  });
  console.log("CAMPAIGNS IN DB:");
  console.log(JSON.stringify(campaigns, null, 2));
}
run().finally(() => prisma.$disconnect());
