import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { randomUUID } from 'crypto';

export interface AiActivityInput {
  orgId: string;
  teamId?: string | null;
  contactId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  actorType: 'ai' | 'staff' | 'system';
  actorId?: string | null;
  actionType: string;
  inputMessage?: string | null;
  outputMessage?: string | null;
  intent?: string | null;
  confidence?: number | null;
  scenarioName?: string | null;
  knowledgeSource?: string | null;
  tagsAdded?: string[];
  appointmentId?: string | null;
  assignedUserId?: string | null;
  metadata?: Record<string, unknown>;
  review?: {
    issueType: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    reason?: string;
    suggestedFix?: string;
    customerMessage?: string | null;
    aiResponse?: string | null;
  };
}

export async function logAiActivity(input: AiActivityInput) {
  const log = await prisma.aiActivityLog.create({
    data: {
      id: randomUUID(),
      orgId: input.orgId,
      teamId: input.teamId || null,
      contactId: input.contactId || null,
      conversationId: input.conversationId || null,
      messageId: input.messageId || null,
      actorType: input.actorType,
      actorId: input.actorId || null,
      actionType: input.actionType,
      inputMessage: input.inputMessage || null,
      outputMessage: input.outputMessage || null,
      intent: input.intent || null,
      confidence: input.confidence ?? null,
      scenarioName: input.scenarioName || null,
      knowledgeSource: input.knowledgeSource || null,
      tagsAdded: input.tagsAdded || [],
      appointmentId: input.appointmentId || null,
      assignedUserId: input.assignedUserId || null,
      metadata: (input.metadata || {}) as Prisma.InputJsonObject,
    },
  });

  const shouldReview = input.review || (typeof input.confidence === 'number' && input.confidence < 0.45);
  if (shouldReview) {
    await prisma.aiReviewItem.create({
      data: {
        id: randomUUID(),
        orgId: input.orgId,
        teamId: input.teamId || null,
        contactId: input.contactId || null,
        conversationId: input.conversationId || null,
        messageId: input.messageId || null,
        aiActivityLogId: log.id,
        issueType: input.review?.issueType || 'low_confidence',
        severity: input.review?.severity || (typeof input.confidence === 'number' && input.confidence < 0.2 ? 'high' : 'medium'),
        customerMessage: input.review?.customerMessage ?? input.inputMessage ?? null,
        aiResponse: input.review?.aiResponse ?? input.outputMessage ?? null,
        reason: input.review?.reason || 'AI confidence thấp hoặc cần kiểm tra lại',
        suggestedFix: input.review?.suggestedFix || null,
        updatedAt: new Date(),
      },
    });
  }

  return log;
}

export function detectNegativeAiFeedback(text: string) {
  return /(không đúng|sai rồi|gặp nhân viên|tư vấn viên đâu|bực mình|khó hiểu|không hiểu|trả lời sai|nói chuyện với người thật)/i.test(text);
}
