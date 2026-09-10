import { prisma } from './src/shared/database/prisma-client.js';

async function main() {
  const campaigns = await prisma.campaign.findMany({ include: { scenario: true } });
  console.log(JSON.stringify(campaigns, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
