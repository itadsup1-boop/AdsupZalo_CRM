import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

async function run() {
  const org = await prisma.organization.findFirst();
  const user = await prisma.user.findFirst({ where: { orgId: org.id } });
  const campaign = await prisma.campaign.findFirst({ where: { orgId: org.id } });

  if (!campaign || !user) return console.log("Missing data");

  // Create token
  // The secret in .env is JWT_SECRET
  const secret = process.env.JWT_SECRET || 'ZaloCRM_Secret_Key_Change_Me_In_Production_@2024';
  const token = jwt.sign({ id: user.id, orgId: user.orgId, role: user.role }, secret);

  console.log("Sending request to campaign:", campaign.id);
  const response = await fetch(`http://localhost:3080/api/v1/campaigns/${campaign.id}/start`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Body:", text);
}

run().catch(console.error).finally(()=>prisma.$disconnect());
