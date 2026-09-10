import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { zaloPool } from '../zalo/zalo-pool.js';

export async function sendConversationText(input: {
  orgId: string;
  conversationId: string;
  content: string;
  senderName: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { orgId: input.orgId, id: input.conversationId },
    include: { zaloAccount: true, contact: true },
  });
  if (!conversation) throw new Error('Conversation not found');
  if (!conversation.zaloAccountId || !conversation.externalThreadId) {
    throw new Error('Conversation does not have a connected personal Zalo thread');
  }

  const instance = zaloPool.getInstance(conversation.zaloAccountId);
  if (!instance?.api) throw new Error('Zalo account not connected');

  const threadType = conversation.threadType === 'group' ? 1 : 0;
  const sendResult = await instance.api.sendMessage({ msg: input.content }, conversation.externalThreadId, threadType);
  const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');
  const messageId = randomUUID();

  const message = await prisma.message.create({
    data: {
      id: messageId,
      orgId: input.orgId,
      conversationId: input.conversationId,
      zaloMsgId: zaloMsgId || `automation-${messageId}`,
      senderType: 'self',
      senderUid: conversation.zaloAccount?.zaloUid || '',
      senderName: input.senderName,
      content: input.content,
      contentType: 'text',
      sentAt: new Date(),
    },
  });

  await prisma.conversation.update({
    where: { orgId_id: { orgId: input.orgId, id: input.conversationId } },
    data: { isReplied: true, unreadCount: 0, lastMessageAt: new Date(), lastStaffMessageAt: new Date() },
  });

  return message;
}
