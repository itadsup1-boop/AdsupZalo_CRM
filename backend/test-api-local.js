import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const org = await prisma.organization.findFirst();
  const user = await prisma.user.findFirst({ where: { orgId: org.id } });
  const campaign = await prisma.campaign.findFirst({ where: { orgId: org.id } });

  if (!campaign) return console.log("No campaign found");

  try {
    console.log("Starting campaign manually via Prisma to see any errors...");
    
    // Get contacts to send to
    let contacts = [];
    const targetTags = campaign.targetTags;
    console.log("TargetTags:", targetTags, "isArray:", Array.isArray(targetTags));
    
    if (Array.isArray(targetTags) && targetTags.length > 0) {
      const contactTags = await prisma.contactTag.findMany({
        where: {
          orgId: user.orgId,
          tagId: { in: targetTags }
        },
        select: { contactId: true }
      });
      const contactIds = Array.from(new Set(contactTags.map(ct => ct.contactId)));
      console.log("Found contactIds from tags:", contactIds.length);
      if (contactIds.length > 0) {
        contacts = await prisma.contact.findMany({
          where: {
            orgId: user.orgId,
            id: { in: contactIds }
          }
        });
      }
    } else {
      contacts = await prisma.contact.findMany({
        where: { orgId: user.orgId }
      });
    }

    console.log(`Found ${contacts.length} contacts`);
    
    const scenario = await prisma.messageScenario.findFirst({
        where: { id: campaign.scenarioId },
        include: { steps: true }
    });
    
    console.log("Scenario:", scenario ? "FOUND" : "NOT FOUND", scenario ? scenario.steps.length + " steps" : "");

    // Simulate the logic in route
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'running' }
    });
    
    console.log("Campaign updated to running");
    
  } catch(e) {
    console.error("ERROR", e);
  }
}
run().catch(console.error).finally(()=>prisma.$disconnect());
