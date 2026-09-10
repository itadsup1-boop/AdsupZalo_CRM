import { PrismaClient } from '/app/node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();

async function run() {
  const campaign = await prisma.campaign.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  if (!campaign) {
    console.log("No campaign found");
    return;
  }
  console.log("Current status of campaign:", campaign.name, "is", campaign.status);
  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'running' }
  });
  console.log("Updated status to:", updated.status);
}
run().finally(() => prisma.$disconnect());
