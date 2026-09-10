require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

async function test() {
  const org = await prisma.organization.findFirst();
  const user = await prisma.user.findFirst({ where: { orgId: org.id } });
  
  const campaign = await prisma.campaign.findFirst({
    where: { orgId: org.id }
  });
  
  if (!campaign) {
    console.log("No campaigns found in db");
    return;
  }
  
  console.log("Found campaign:", campaign.id, campaign.name, campaign.targetTags);
  
  try {
      const targetTags = campaign.targetTags;
      console.log("Target tags isArray?", Array.isArray(targetTags), targetTags);
      
      let contacts = [];
      if (Array.isArray(targetTags) && targetTags.length > 0) {
        const contactTags = await prisma.contactTag.findMany({
          where: {
            orgId: user.orgId,
            tagId: { in: targetTags }
          },
          select: { contactId: true }
        });
        const contactIds = Array.from(new Set(contactTags.map(ct => ct.contactId)));
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
      
      console.log("Found contacts:", contacts.length);
      
      const scenario = await prisma.messageScenario.findFirst({
          where: { id: campaign.scenarioId },
          include: { steps: true }
      });
      
      if (!scenario) {
          console.log("Scenario not found");
          return;
      }
      
      let scheduled = 0;
      if (scenario && scenario.steps) {
        const activeSteps = scenario.steps.filter(s => s.isActive);
        for (const contact of contacts) {
          for (const step of activeSteps) {
            const scheduledAt = step.delayType === 'absolute' && step.absoluteTime
              ? new Date(step.absoluteTime)
              : new Date(Date.now() + step.delayMinutes * 60 * 1000);
            
            const existing = await prisma.scheduledMessage.findFirst({
              where: {
                orgId: user.orgId,
                contactId: contact.id,
                campaignId: campaign.id,
                stepId: step.id,
                status: 'pending'
              }
            });

            if (existing) continue;

            await prisma.scheduledMessage.create({
              data: {
                orgId: user.orgId,
                contactId: contact.id,
                campaignId: campaign.id,
                scenarioId: campaign.scenarioId,
                stepId: step.id,
                zaloAccountId: campaign.zaloAccountId,
                content: step.content,
                scheduledAt,
                status: 'pending'
              }
            });
            scheduled++;
          }
        }
      }
      
      console.log("Scheduled", scheduled, "messages.");
  } catch (e) {
      console.error("Error scheduling:", e);
  }
}

test().catch(console.error).finally(() => prisma.$disconnect());
