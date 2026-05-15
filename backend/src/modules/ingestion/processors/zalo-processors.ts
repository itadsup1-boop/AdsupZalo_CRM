import { prisma } from '../../../shared/database/prisma-client.js';
import { logger } from '../../../shared/utils/logger.js';
import { handleIncomingMessage } from '../../chat/message-handler.js';

// 4.2 Tách Processor: message-processor
export async function messageProcessor(job: any) {
  const { messages, account, orgId } = job;
  
  logger.info(`[processor:message] Processing ${messages.length} messages for Org ${orgId}`);

  for (const msg of messages) {
    try {
      // Ensure the account object also has orgId for tenant lookup
      const accountWithOrg = {
        ...account,
        orgId: orgId || account?.orgId
      };
      
      // Normalize & Deduplicate are already inside handleIncomingMessage
      await handleIncomingMessage(messageWithContext, accountWithOrg);
    } catch (err) {
      logger.error(`[processor:message] Failed to process message ${msg.msgId}:`, err);
      throw err; // Trigger retry
    }
  }
}

// 4.2 Tách Processor: contact-processor (Update profile)
export async function contactProcessor(job: any) {
  const { contactData, orgId } = job;
  
  if (!contactData) return;

  await prisma.contact.upsert({
    where: { orgId_zaloUid: { orgId, zaloUid: contactData.zaloUid } },
    update: { 
      name: contactData.name, 
      avatar: contactData.avatar,
      lastActivity: new Date()
    },
    create: {
      orgId,
      zaloUid: contactData.zaloUid,
      name: contactData.name,
      avatar: contactData.avatar
    }
  });
}
