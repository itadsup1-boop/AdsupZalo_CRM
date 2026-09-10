import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { generateAiOutput } from './ai-service.js';
import { sendConversationText } from '../appointments/customer-message-service.js';

// Default wait time: 3 minutes
const AUTONOMOUS_DELAY_MS = 3 * 60 * 1000; 

async function runAutonomousPass() {
  const now = new Date();
  
  // Find conversations that are eligible for autonomous reply
  const conversations = await prisma.conversation.findMany({
    where: {
      aiPaused: false,
      lastCustomerMessageAt: { not: null },
    },
    take: 50,
  });

  for (const conversation of conversations) {
    if (!conversation.lastCustomerMessageAt) continue;
    
    // If staff replied AFTER the customer, or AI already replied recently, skip.
    // (AI replies also update lastStaffMessageAt)
    if (conversation.lastStaffMessageAt && conversation.lastStaffMessageAt >= conversation.lastCustomerMessageAt) {
      continue;
    }

    // Check if enough time has passed since the last customer message
    const dueAt = new Date(conversation.lastCustomerMessageAt.getTime() + AUTONOMOUS_DELAY_MS);
    if (dueAt > now) {
      continue;
    }

    logger.info(`[autonomous] Triggering AI auto-reply for conversation ${conversation.id}`);
    
    try {
      // 1. Generate the reply using Ollama
      const aiResult = await generateAiOutput({
        orgId: conversation.orgId,
        conversationId: conversation.id,
        type: 'reply_draft',
      }) as { content: string };
      const aiResponseText = aiResult?.content || '';

      if (!aiResponseText || aiResponseText.includes('[CANNOT_ANSWER]')) {
        logger.info(`[autonomous] AI returned CANNOT_ANSWER or empty for conversation ${conversation.id}`);
        // Pause AI so we don't keep trying
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { aiPaused: true }
        });
        continue;
      }

      // 2. Send the message via Zalo API
      await sendConversationText({
        orgId: conversation.orgId,
        conversationId: conversation.id,
        content: aiResponseText,
        senderName: 'AI Assistant',
      });
      
      // 3. Update the conversation timestamps so we don't spam
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastStaffMessageAt: new Date(),
          isReplied: true,
        }
      });
      
    } catch (err) {
      logger.error(`[autonomous] Failed to trigger AI auto-reply for conversation ${conversation.id}:`, err);
    }
  }
}

export function startAutonomousScheduler() {
  // --- DISABLE AUTO-REPLY VIA CRON ---
  // The Python AI API now handles auto-reply, debounce, and callback directly.
  // cron.schedule('* * * * *', async () => {
  //   try {
  //     await runAutonomousPass();
  //   } catch (err) {
  //     logger.error('[autonomous] Cron job error:', err);
  //   }
  // });

  logger.info('[autonomous] Node.js AI auto-reply cron is DISABLED (Delegated to Python AI API)');
}
