/**
 * message-handler.ts — persists incoming Zalo messages to the database.
 * Called from zalo-pool's startListener on every 'message' / 'undo' event.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID, createHash } from 'node:crypto';
import { emitWebhook } from '../api/webhook-service.js';
import { runAutomationRules } from '../automation/automation-service.js';

function generateMessageFingerprint(senderId: string, content: string, timestamp: number): string {
  // Round timestamp to nearest 5 seconds to handle slight clock skews
  const roundedTs = Math.floor(timestamp / 5000) * 5000;
  const raw = `${senderId}|${content}|${roundedTs}`;
  return createHash('sha256').update(raw).digest('hex');
}

export interface IncomingMessage {
  accountId: string;
  senderUid: string;
  senderName: string;       // zaloName (from cache or dName fallback)
  content: string;
  contentType: string;      // text, image, sticker, video, voice, gif, link, file
  msgId: string;
  timestamp: number;        // epoch ms
  isSelf: boolean;
  threadId: string;         // For user: contact UID. For group: group ID
  threadType: 'user' | 'group'; // user or group conversation
  groupName?: string;       // group name if group message
  attachments?: any[];
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  duration?: number | null;
  size?: number | null;
  quote?: unknown;
  albumKey?: string | null;
  albumIndex?: number | null;
  albumTotal?: number | null;
  isBackfill?: boolean;     // true for old_messages / sync backfill — skip automations
}

export interface HandleMessageResult {
  message: {
    id: string;
    conversationId: string;
    zaloMsgId: string | null;
    senderType: string;
    senderUid: string | null;
    senderName: string | null;
    content: string | null;
    contentType: string;
    attachments: any;
    albumKey: string | null;
    albumIndex: number | null;
    albumTotal: number | null;
    isDeleted: boolean;
    deletedAt: Date | null;
    sentAt: Date;
    repliedByUserId: string | null;
    createdAt: Date;
  };
  conversationId: string;
  orgId: string;
  contactId: string | null;
}

export async function handleIncomingMessage(
  msg: IncomingMessage,
  providedAccount?: { orgId: string; ownerUserId: string | null; teamId?: string | null }
): Promise<HandleMessageResult | null> {
  console.log("[AI_AGENT] handler entered", {
    messageId: msg.msgId,
    threadId: msg.threadId,
    senderUid: msg.senderUid,
    content: msg.content,
    isSelf: msg.isSelf,
    senderType: msg.senderType,
  });

  try {
    let account = providedAccount;

    if (!account || !('teamId' in account)) {
      account = await prisma.zaloAccount.findUnique({
        where: { id: msg.accountId },
        select: { id: true, orgId: true, ownerUserId: true, teamId: true },
      }) as any;
    }
    
    if (!account) return null;

    const db = getTenantPrisma(account.orgId);
    const contactId = await upsertContact(db, msg, account.orgId, msg.accountId, account.teamId);

    // Update lastActivity for lead scoring freshness
    if (contactId) {
      db.contact.update({
        where: { id: contactId },
        data: { lastActivity: new Date() },
      }).catch(() => {});
    }

    // Consistency Check 1: Ensure contact belongs to the correct org
    if (contactId) {
      const contactCheck = await prisma.contact.findUnique({ where: { id: contactId }, select: { orgId: true } });
      if (contactCheck && contactCheck.orgId !== account.orgId) {
        throw new Error(`[Security] Cross-tenant violation: Contact ${contactId} does not belong to Org ${account.orgId}`);
      }
    }

    const conversation = await findOrCreateConversation(
      db,
      msg,
      account.orgId,
      contactId,
      msg.accountId,
      account.teamId
    );

    // Consistency Check 2: Ensure conversation belongs to the correct org
    const convCheck = await prisma.conversation.findUnique({ where: { id: conversation.id }, select: { orgId: true } });
    if (convCheck && convCheck.orgId !== account.orgId) {
      throw new Error(`[Security] Cross-tenant violation: Conversation ${conversation.id} does not belong to Org ${account.orgId}`);
    }

    const sentAt = new Date(msg.timestamp);
    const fingerprint = generateMessageFingerprint(msg.senderUid, msg.content || '', msg.timestamp);

    // Dedup guard using Fingerprint
    const existingFingerprint = await db.message.findFirst({
      where: { conversationId: conversation.id, messageFingerprint: fingerprint },
      select: { id: true },
    });
    if (existingFingerprint) {
      logger.debug(`[message-handler] Skipping duplicate message via fingerprint: ${fingerprint}`);
      return null;
    }

    // Dedup guard for self messages (Legacy support)
    if (msg.isSelf && msg.msgId) {
      const recentDupe = await db.message.findFirst({
        where: {
          conversationId: conversation.id,
          senderType: 'self',
          content: msg.content || '',
          sentAt: { gte: new Date(Date.now() - 30_000) },
        },
        select: { id: true, zaloMsgId: true },
      });
      if (recentDupe) {
        // If the existing record has no zaloMsgId, backfill it for future dedup
        if (!recentDupe.zaloMsgId && msg.msgId) {
          await db.message.update({
            where: { id: recentDupe.id },
            data: { zaloMsgId: msg.msgId },
          }).catch(() => {});
        }
        logger.debug(`[message-handler] Skipping self echo: content match within 30s`);
        return null;
      }
    }

    // Deduplication logic
    let existing = null;
    if (msg.msgId) {
      existing = await db.message.findFirst({
        where: { conversationId: conversation.id, zaloMsgId: msg.msgId },
      });
    }

    if (existing) {
      await updateConversationSyncState(db, account.orgId, msg.accountId, conversation.id, sentAt, msg.msgId);
      return { message: existing as any, conversationId: conversation.id, orgId: account.orgId, contactId };
    }

    const finalFingerprint = generateMessageFingerprint(msg.senderUid, msg.content || '', msg.timestamp);

    const isHumanSelf = msg.isSelf && (!msg.msgId || !msg.msgId.startsWith('ai-'));

    // Create new message
    let message;
    try {
      message = await db.message.create({
        data: {
          id: randomUUID(),
          orgId: account.orgId,
          conversationId: conversation.id,
          messageFingerprint: finalFingerprint,
          zaloMsgId: msg.msgId || `hydrated-${randomUUID()}`,
          senderType: msg.isSelf ? 'self' : 'customer',
          senderUid: msg.senderUid,
          senderName: msg.senderName || null,
          content: msg.content || '',
          contentType: msg.contentType || 'text',
          fileUrl: msg.fileUrl ?? null,
          fileName: msg.fileName ?? null,
          mimeType: msg.mimeType ?? null,
          duration: msg.duration ?? null,
          size: msg.size ?? null,
          attachments: msg.attachments ?? [],
          quote: msg.quote ?? undefined,
          albumKey: msg.albumKey ?? null,
          albumIndex: msg.albumIndex ?? null,
          albumTotal: msg.albumTotal ?? null,
          sentAt,
        },
      });

    } catch (err: any) {
      // P2002 = unique constraint violation → duplicate zaloMsgId, skip silently
      if (err?.code === 'P2002') {
        logger.debug(`[message-handler] Skipping duplicate zaloMsgId=${msg.msgId}`);
        // Even if message is duplicate, ensure conversation timestamp is updated
        await updateConversationAfterMessage(db, conversation.id, sentAt, msg.isSelf, isHumanSelf);
        await updateConversationSyncState(db, account.orgId, msg.accountId, conversation.id, sentAt, msg.msgId);
        return null;
      }
      throw err;
    }

    await updateConversationAfterMessage(db, conversation.id, sentAt, msg.isSelf, isHumanSelf);
    await updateConversationSyncState(db, account.orgId, msg.accountId, conversation.id, sentAt, msg.msgId || message.zaloMsgId);

    if (!msg.isSelf && msg.contentType === 'text' && msg.content) {
      const { detectNegativeAiFeedback, logAiActivity } = await import('../ai/ai-audit-service.js');
      if (detectNegativeAiFeedback(msg.content)) {
        await logAiActivity({
          orgId: account.orgId,
          teamId: account.teamId || null,
          contactId,
          conversationId: conversation.id,
          messageId: message.id,
          actorType: 'system',
          actionType: 'ai.negative_feedback_detected',
          inputMessage: msg.content,
          confidence: 0.9,
          review: {
            issueType: 'negative_feedback',
            severity: 'high',
            reason: 'Khách phản hồi tiêu cực hoặc yêu cầu gặp nhân viên',
            customerMessage: msg.content,
            suggestedFix: 'Nhân viên kiểm tra hội thoại, tạm dừng AI nếu cần.',
          },
        });
      }
    }

    if (isHumanSelf) {
      conversation.aiPaused = true;
      // Broadcast update to frontend via WebSockets
      const { zaloPool } = await import('../zalo/zalo-pool.js');
      if (zaloPool.io) {
        const { emitToConversationRooms } = await import('../../shared/utils/permission-scope.js');
        emitToConversationRooms(zaloPool.io, conversation.id, account.orgId, 'chat:ai-status', { conversationId: conversation.id, aiPaused: true });
      }
    }

    // Track first outbound contact date — set once when agent sends first message
    if (msg.isSelf && contactId) {
      db.contact.updateMany({
        where: { id: contactId, firstContactDate: null },
        data: { firstContactDate: new Date(msg.timestamp) },
      }).catch(() => {});
    }

    // Skip webhooks and automation for backfilled messages (old_messages / sync)
    if (msg.isBackfill) {
      return {
        message,
        conversationId: conversation.id,
        orgId: account.orgId,
        contactId,
      };
    }

    // Emit webhook for message event (fire-and-forget)
    emitWebhook(account.orgId, msg.isSelf ? 'message.sent' : 'message.received', {
      messageId: message.id,
      conversationId: conversation.id,
      senderUid: msg.senderUid,
      content: msg.content,
      contentType: msg.contentType,
      sentAt: message.sentAt,
    });

    // Send Push Notifications to assigned users
    if (!msg.isSelf) {
      void (async () => {
        try {
          const { sendPushNotification } = await import('../notifications/push-service.js');
          const { getZaloAccountAuthorizedUserIds } = await import('../../shared/utils/permission-scope.js');
          
          // 1. Find all authorized users for this Zalo Account
          const authorizedUserIds = await getZaloAccountAuthorizedUserIds(msg.accountId);
          
          // 2. Filter to active users in this organization
          const activeUsers = await prisma.user.findMany({
            where: {
              id: { in: authorizedUserIds },
              orgId: account.orgId,
              isActive: true
            },
            select: { id: true }
          });
          
          const userIds = new Set(activeUsers.map(u => u.id));

          // Also include the Zalo Account owner directly if they are active in the organization
          if (account.ownerUserId) {
            const ownerUser = await prisma.user.findFirst({
              where: {
                id: account.ownerUserId,
                orgId: account.orgId,
                isActive: true
              },
              select: { id: true }
            });
            if (ownerUser) {
              userIds.add(ownerUser.id);
            }
          }
          
          // 3. Send notification to each user
          for (const userId of userIds) {
            await sendPushNotification(userId, account.orgId, {
              title: msg.senderName || 'Tin nhắn mới',
              body: msg.content?.substring(0, 100) || 'Bạn có tin nhắn mới từ Zalo',
              data: {
                conversationId: conversation.id,
                url: `/chat/${conversation.id}`
              }
            });
          }
        } catch (err) {
          logger.error('[push] Error in background push task:', err);
        }
      })();
    }

    // --- PYTHON AI API FORWARDING ---
    console.log("[AI_AGENT] skip check", {
      enabled: process.env.AI_AGENT_ENABLED,
      url: process.env.AI_AGENT_WEBHOOK_URL,
      shouldForward: process.env.AI_AGENT_ENABLED === "true" && !msg.isSelf && !msg.isBackfill,
    });

    if (!msg.isBackfill && !msg.isSelf) {
      void (async () => {
        try {
          const { config } = await import('../../config/index.js');
          const axios = (await import('axios')).default;
          
          if (config.aiAgentEnabled && config.aiAgentWebhookUrl) {
            const payload = {
              event: "zalo_message",
              org_id: account.orgId,
              account_id: msg.accountId,
              conversation_id: conversation.id,
              contact_id: contactId,
              message_id: message?.id,
              zalo_msg_id: msg.msgId || message?.zaloMsgId,
              sender_uid: msg.senderUid,
              sender_name: msg.senderName,
              content: msg.content || '',
              content_type: msg.contentType,
              timestamp: msg.timestamp,
              is_self: false
            };
            
            console.log("[AI_AGENT] forwarding message to Python", {
              url: config.aiAgentWebhookUrl,
              conversation_id: conversation.id,
              contact_id: contactId,
              message_id: message?.id,
              content: msg.content,
              is_self: false,
            });

            await axios.post(config.aiAgentWebhookUrl, payload, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 60000
            });
            logger.info(`[message-handler] Forwarded message ${message?.id} to Python AI API`);
          } else {
            console.log("[AI_AGENT] skipped forwarding because aiAgentEnabled=false or url is missing", {
              aiAgentEnabled: config.aiAgentEnabled,
              aiAgentWebhookUrl: config.aiAgentWebhookUrl
            });
          }
        } catch (err: any) {
          console.error("[AI_AGENT] forward failed", err.message);
          logger.error('[message-handler] Failed to forward to Python AI API:', err.message);
        }
      })();
    }
    // ----------------------------

    // --- AI INTENT CLASSIFICATION ---
    if (!msg.isSelf && !msg.isBackfill && msg.contentType === 'text' && contactId) {
      void (async () => {
        try {
          const classificationEnabled = await db.appSetting.findFirst({
            where: { orgId: account!.orgId, settingKey: 'ai_intent_classification_enabled', valuePlain: 'true' }
          });

          if (classificationEnabled) {
            logger.info(`[AI-Intent] Running intent classification for message in conversation ${conversation.id}`);
            const { classifyCustomerIntent } = await import('../ai/ai-service.js');
            const classification = await classifyCustomerIntent(account!.orgId, msg.content || '', conversation.id);
            
            if (classification && classification.intent !== 'none') {
              const intentMapping: Record<string, { name: string; color: string }> = {
                ask_price: { name: 'Hỏi giá', color: '#FF9800' },
                ask_service: { name: 'Hỏi dịch vụ', color: '#2196F3' },
                book_appointment: { name: 'Đặt lịch', color: '#4CAF50' },
                ask_address: { name: 'Hỏi địa chỉ', color: '#009688' },
                complain: { name: 'Phàn nàn', color: '#F44336' },
                callback_request: { name: 'Yêu cầu gọi lại', color: '#E91E63' },
                difficult_question: { name: 'Câu hỏi khó', color: '#9C27B0' },
              };

              const mapped = intentMapping[classification.intent];
              if (mapped) {
                // Find or create Tag
                let tag = await db.tag.findFirst({
                  where: { orgId: account!.orgId, name: mapped.name, isActive: true }
                });
                if (!tag) {
                  tag = await db.tag.create({
                    data: {
                      orgId: account!.orgId,
                      name: mapped.name,
                      color: mapped.color,
                      description: 'Tự động phân loại bằng AI'
                    }
                  });
                }

                // Attach Tag to Contact Tag mapping if not already attached
                const existingMapping = await db.contactTag.findFirst({
                  where: { contactId, tagId: tag.id }
                });
                if (!existingMapping) {
                  await db.contactTag.create({
                    data: { orgId: account!.orgId, contactId, tagId: tag.id }
                  });

                  // Update Contact's JSON tags array
                  const contact = await db.contact.findUnique({
                    where: { id: contactId },
                    select: { tags: true }
                  });
                  let currentTags: string[] = [];
                  if (contact?.tags && Array.isArray(contact.tags)) {
                    currentTags = contact.tags as string[];
                  }
                  if (!currentTags.includes(mapped.name)) {
                    currentTags.push(mapped.name);
                    await db.contact.update({
                      where: { id: contactId },
                      data: { tags: currentTags }
                    });
                  }

                  // Broadcast update to frontend via WebSockets
                  const { zaloPool } = await import('../zalo/zalo-pool.js');
                  if (zaloPool.io) {
                    const { emitToContactRooms } = await import('../../shared/utils/permission-scope.js');
                    const updatedContact = await db.contact.findUnique({
                      where: { id: contactId },
                      include: {
                        assignedUser: { select: { id: true, fullName: true, email: true } },
                        appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
                        contactTags: { include: { tag: true } },
                        _count: { select: { conversations: true } },
                      }
                    });
                    if (updatedContact) {
                      emitToContactRooms(zaloPool.io, contactId, account!.orgId, 'contact:update', updatedContact);
                    }
                  }

                  // Trigger tag-based automation
                  try {
                    const { triggerTagAutomation } = await import('../contacts/contact-sub-resource-routes.js');
                    await triggerTagAutomation(account!.orgId, contactId, tag.id);
                  } catch (autoErr) {
                    logger.error('[AI-Intent] Failed to trigger automation for intent tag:', autoErr);
                  }
                }
              }
            }
          }
        } catch (err) {
          logger.error('[AI-Intent] Error in background intent classification:', err);
        }
      })();
    }


    if (!msg.isSelf) {
      const org = await db.organization.findUnique({
        where: { id: account.orgId },
        select: { id: true, name: true },
      });
      const contact = contactId
        ? await db.contact.findUnique({
            where: { id: contactId },
            select: { id: true, fullName: true, crmName: true, phone: true, status: true, source: true, assignedUserId: true },
          })
        : null;
      const conversationDetails = await db.conversation.findUnique({
        where: { id: conversation.id },
        select: { id: true, unreadCount: true, externalThreadId: true, threadType: true, zaloAccountId: true },
      });

      void runAutomationRules({
        trigger: 'message_received',
        orgId: account.orgId,
        org,
        contact,
        conversation: conversationDetails
          ? {
              id: conversationDetails.id,
              unreadCount: conversationDetails.unreadCount,
              threadId: conversationDetails.externalThreadId || undefined,
              threadType: conversationDetails.threadType || undefined,
              zaloAccountId: conversationDetails.zaloAccountId || undefined,
            }
          : null,
        message: { id: message.id, content: message.content, contentType: message.contentType, senderType: message.senderType },
      });
    }

    return {
      message,
      conversationId: conversation.id,
      orgId: account.orgId,
      contactId,
    };
  } catch (err) {
    logger.error('[message-handler] handleIncomingMessage error:', err);
    return null;
  }
}

// Upsert contact — handles both user and group conversations
async function upsertContact(db: any, msg: IncomingMessage, orgId: string, accountId: string, teamId?: string | null): Promise<string | null> {
  // Group messages: create/update a "contact" record representing the group
  if (msg.threadType === 'group') {
    const groupUid = msg.threadId;
    const existingConversation = await db.conversation.findFirst({
      where: { orgId, zaloAccountId: accountId, externalThreadId: groupUid },
      select: { contactId: true },
    });

    let groupContact = await db.contact.findFirst({
      where: existingConversation?.contactId
        ? { id: existingConversation.contactId, orgId }
        : {
            orgId,
            zaloUid: groupUid,
            conversations: { some: { zaloAccountId: accountId, externalThreadId: groupUid } },
          },
      select: { id: true, fullName: true, teamId: true },
    });

    if (!groupContact) {
      groupContact = await db.contact.create({
        data: {
          id: randomUUID(),
          zaloUid: groupUid,
          fullName: msg.groupName || 'Nhóm',
          metadata: { isGroup: true },
          teamId: teamId || null,
        },
        select: { id: true, fullName: true, teamId: true },
      });
      // Emit webhook for new contact created
      emitWebhook(orgId, 'contact.created', { contactId: groupContact.id, fullName: groupContact.fullName });
      const { assignContactToSale } = await import('../assignment/assignment-service.js');
      assignContactToSale(groupContact.id, orgId, { type: 'system' }).catch((err) => logger.error('[assignment] Auto assign group contact failed:', err));
    } else {
      const updateData: any = {};
      let needsUpdate = false;

      if (msg.groupName && groupContact.fullName !== msg.groupName) {
        updateData.fullName = msg.groupName;
        needsUpdate = true;
      }

      if (teamId) {
        if (!groupContact.teamId) {
          updateData.teamId = teamId;
          needsUpdate = true;
        } else if (groupContact.teamId !== teamId) {
          logger.warn(`[message-handler:upsertContact] Contact ${groupContact.id} has teamId ${groupContact.teamId}, but incoming message teamId is ${teamId}. Keeping existing contact teamId.`);
        }
      }

      if (needsUpdate) {
        await db.contact.update({
          where: { id: groupContact.id },
          data: updateData,
        });
      }
    }
    return groupContact.id;
  }

  // For self messages on user threads, the contact is the thread recipient (threadId = contact UID)
  const contactUid = msg.isSelf ? msg.threadId : msg.senderUid;
  const contactName = msg.isSelf ? '' : msg.senderName; // self msgs don't carry recipient name

  const existingConversation = await db.conversation.findFirst({
    where: { orgId, zaloAccountId: accountId, externalThreadId: msg.threadId },
    select: { contactId: true },
  });

  let contact = await db.contact.findFirst({
    where: existingConversation?.contactId
      ? { id: existingConversation.contactId, orgId }
      : {
          orgId,
          zaloUid: contactUid,
          conversations: { some: { zaloAccountId: accountId, externalThreadId: msg.threadId } },
        },
    select: { id: true, fullName: true, teamId: true },
  });

  if (!contact) {
    contact = await db.contact.create({
      data: {
        id: randomUUID(),
        zaloUid: contactUid,
        fullName: contactName || 'Unknown',
        teamId: teamId || null,
      },
      select: { id: true, fullName: true, teamId: true },
    });
    // Emit webhook for new contact created
    emitWebhook(orgId, 'contact.created', { contactId: contact.id, fullName: contact.fullName });
    const { assignContactToSale } = await import('../assignment/assignment-service.js');
    assignContactToSale(contact.id, orgId, { type: 'system' }).catch((err) => logger.error('[assignment] Auto assign contact failed:', err));
  } else {
    const updateData: any = {};
    let needsUpdate = false;

    if (contactName && contact.fullName !== contactName && contact.fullName === 'Unknown') {
      updateData.fullName = contactName;
      needsUpdate = true;
    }

    if (teamId) {
      if (!contact.teamId) {
        updateData.teamId = teamId;
        needsUpdate = true;
      } else if (contact.teamId !== teamId) {
        logger.warn(`[message-handler:upsertContact] Contact ${contact.id} has teamId ${contact.teamId}, but incoming message teamId is ${teamId}. Keeping existing contact teamId.`);
      }
    }

    if (needsUpdate) {
      await db.contact.update({
        where: { id: contact.id },
        data: updateData,
      });
    }
  }

  return contact.id;
}

// Find or create conversation — externalThreadId = threadId for both user and group
async function findOrCreateConversation(
  db: any,
  msg: IncomingMessage,
  orgId: string,
  contactId: string | null,
  accountId: string,
  teamId?: string | null
) {
  const externalThreadId = msg.threadId;

  const existing = await db.conversation.findFirst({
    where: { orgId, zaloAccountId: accountId, externalThreadId },
    select: { id: true, aiPaused: true },
  });

  if (existing) {
    // Optionally check if we need to backfill teamId on existing conversation
    const existingDetails = await db.conversation.findUnique({
      where: { id: existing.id },
      select: { teamId: true }
    });
    if (existingDetails && !existingDetails.teamId && teamId) {
      await db.conversation.update({
        where: { id: existing.id },
        data: { teamId }
      });
    }
    return existing;
  }

  return db.conversation.create({
    data: {
      id: randomUUID(),
      orgId,
      teamId: teamId || null,
      zaloAccountId: accountId,
      contactId: contactId,
      threadType: msg.threadType || 'personal',
      externalThreadId,
      lastMessageAt: new Date(msg.timestamp),
      unreadCount: msg.isSelf ? 0 : 1,
      isReplied: msg.isSelf,
    },
    select: { id: true, aiPaused: true },
  });
}

// Update conversation metadata after a new message
async function updateConversationAfterMessage(
  db: any,
  conversationId: string,
  sentAt: Date,
  isSelf: boolean,
  isHumanSelf?: boolean,
): Promise<void> {
  const updateData: any = { lastMessageAt: sentAt };
  if (isSelf) {
    updateData.isReplied = true;
    updateData.unreadCount = 0;
    updateData.lastStaffMessageAt = sentAt;
    if (isHumanSelf) {
      updateData.aiPaused = true;
    }
  } else {
    updateData.unreadCount = { increment: 1 };
    updateData.isReplied = false;
    updateData.lastCustomerMessageAt = sentAt;
    updateData.followupCount = 0;
    updateData.lastFollowupAt = null;
  }
  await db.conversation.update({ where: { id: conversationId }, data: updateData });
}

async function updateConversationSyncState(
  db: any,
  orgId: string,
  accountId: string,
  conversationId: string,
  sentAt: Date,
  msgId?: string | null,
): Promise<void> {
  try {
    const now = new Date();
    const existing = await db.zaloConversationSyncState.findFirst({
      where: { orgId, zaloAccountId: accountId, conversationId },
      select: { id: true, lastSyncedAt: true },
    });

    const shouldAdvance = !existing?.lastSyncedAt || existing.lastSyncedAt < sentAt;
    if (existing) {
      await db.zaloConversationSyncState.update({
        where: { id: existing.id },
        data: {
          syncStatus: 'idle',
          lastError: null,
          updatedAt: now,
          ...(shouldAdvance ? { lastSyncedAt: sentAt, lastMessageId: msgId || null } : {}),
        },
      });
      return;
    }

    await db.zaloConversationSyncState.create({
      data: {
        id: randomUUID(),
        orgId,
        zaloAccountId: accountId,
        conversationId,
        lastSyncedAt: sentAt,
        lastMessageId: msgId || null,
        syncStatus: 'idle',
        updatedAt: now,
      },
    });
  } catch (err) {
    logger.warn(`[message-handler] Failed to update sync state for conversation ${conversationId}:`, err);
  }
}

// Soft-delete a message by its Zalo message ID
export async function handleMessageUndo(accountId: string, zaloMsgId: string): Promise<void> {
  try {
    // Need orgId for safe update
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { orgId: true },
    });
    if (!account) return;
    const db = getTenantPrisma(account.orgId);
    
    await db.message.updateMany({
      where: {
        zaloMsgId: String(zaloMsgId),
        conversation: { orgId: account.orgId, zaloAccountId: accountId },
      },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    logger.info(`[message-handler] Undo message ${zaloMsgId} for account ${accountId}`);
  } catch (err) {
    logger.error('[message-handler] handleMessageUndo error:', err);
  }
}
