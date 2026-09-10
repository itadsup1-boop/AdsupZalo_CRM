import { prisma } from './src/shared/database/prisma-client.js';

async function run() {
  const campaigns = await prisma.campaign.findMany({
    include: { scenario: true }
  });
  console.log("CAMPAIGNS IN DB:");
  console.log(JSON.stringify(campaigns, null, 2));
}
run().finally(() => prisma.$disconnect());
