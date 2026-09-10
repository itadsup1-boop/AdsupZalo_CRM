import { buildApp } from './src/app.js';
import { prisma } from './src/shared/database/prisma-client.js';

async function main() {
  const app = await buildApp();
  
  // Find a user and campaign
  const user = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!user) {
    console.log("No user found");
    return;
  }
  
  // Generate a mock JWT for the user
  const token = app.jwt.sign({ id: user.id, orgId: user.orgId, role: user.role });
  
  const campaign = await prisma.campaign.findFirst();
  if (!campaign) {
    console.log("No campaign found. Creating one...");
    // Let's not create one yet, maybe just log this.
    return;
  }
  
  console.log("Testing campaign start for ID:", campaign.id);
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaign.id}/start`,
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  
  console.log("Status:", response.statusCode);
  console.log("Body:", response.body);
}

main().catch(console.error).finally(() => process.exit(0));
