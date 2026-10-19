import { prisma } from '../../shared/database/prisma-client.js';
import { randomUUID } from 'node:crypto';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { getProviderConfig, getAvailableProviders } from './provider-registry.js';
import { generateWithAnthropic } from './providers/anthropic.js';
import { generateWithGemini } from './providers/gemini.js';
import { generateWithOpenaiCompat } from './providers/openai-compat.js';
import { generateWithOllama } from './providers/ollama.js';
import { buildReplyDraftPrompt } from './prompts/reply-draft.js';
import { buildSummaryPrompt } from './prompts/summary.js';
import { buildSentimentPrompt } from './prompts/sentiment.js';
import { buildIntentPrompt } from './prompts/intent.js';
import { logAiActivity } from './ai-audit-service.js';

export type AiTaskType = 'reply_draft' | 'summary' | 'sentiment' | 'intent';

type MessageContext = { senderType: string; senderName: string | null; content: string | null; sentAt: Date };
type SentimentResult = { label: 'positive' | 'neutral' | 'negative'; confidence: number; reason: string };

function detectLanguage(text: string): 'vi' | 'en' {
  if (/[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(text)) return 'vi';
  const vietnameseHints = [' khách ', ' chào ', ' tư vấn ', ' báo giá ', ' sản phẩm ', ' giúp ', ' nhé ', ' không '];
  return vietnameseHints.some((hint) => (` ${text.toLowerCase()} `).includes(hint)) ? 'vi' : 'en';
}

function escapeXmlBoundary(text: string): string {
  return text.replace(/<\/?conversation_context>/gi, '');
}

function buildConversationContext(messages: MessageContext[]) {
  return messages
    .map((msg) => {
      const author = msg.senderType === 'self' ? 'staff' : (msg.senderName || 'customer');
      const content = escapeXmlBoundary(msg.content || '(empty)');
      return `[${msg.sentAt.toISOString()}] ${author}: ${content}`;
    })
    .join('\n');
}

async function getProviderApiKey(orgId: string, provider: string) {
  /* 1. Check registry (env-based) */
  const providerDef = getProviderConfig(provider);
  if (providerDef?.authToken) return providerDef.authToken;

  /* 2. Fallback: per-org DB setting */
  const setting = await prisma.appSetting.findFirst({
    where: { orgId, settingKey: `ai_${provider}_api_key` },
  });
  return setting?.valuePlain || '';
}

export async function getAiConfig(orgId: string) {
  let aiConfig = await prisma.aiConfig.findUnique({ where: { orgId } });
  if (!aiConfig) {
    aiConfig = await prisma.aiConfig.create({
      data: { orgId, provider: config.aiDefaultProvider, model: config.aiDefaultModel, maxDaily: 500, enabled: true },
    });
  }
  const availableProviders = getAvailableProviders();
  const hasKey = async (p: string) => !!(await getProviderApiKey(orgId, p));
  const [hasAnthropicKey, hasGeminiKey] = await Promise.all([hasKey('anthropic'), hasKey('gemini')]);
  
  const intentClassificationSetting = await prisma.appSetting.findFirst({
    where: { orgId, settingKey: 'ai_intent_classification_enabled' }
  });
  const systemPromptSetting = await prisma.appSetting.findFirst({
    where: { orgId, settingKey: 'ai_system_prompt' }
  });

  return { 
    ...aiConfig, 
    hasAnthropicKey, 
    hasGeminiKey, 
    availableProviders,
    autoReplyEnabled: false,
    intentClassificationEnabled: intentClassificationSetting?.valuePlain === 'true',
    systemPrompt: systemPromptSetting?.valuePlain || ''
  };
}

export async function updateAiConfig(orgId: string, input: { provider?: string; model?: string; maxDaily?: number; enabled?: boolean; autoReplyEnabled?: boolean; intentClassificationEnabled?: boolean; systemPrompt?: string }) {
  const result = await prisma.aiConfig.upsert({
    where: { orgId },
    create: {
      orgId,
      provider: input.provider || config.aiDefaultProvider,
      model: input.model || config.aiDefaultModel,
      maxDaily: input.maxDaily ?? 500,
      enabled: input.enabled ?? true,
    },
    update: {
      provider: input.provider,
      model: input.model,
      maxDaily: input.maxDaily,
      enabled: input.enabled,
    },
  });

  if (input.autoReplyEnabled !== undefined) {
    await prisma.appSetting.upsert({
      where: { orgId_settingKey: { orgId, settingKey: 'ai_auto_reply_enabled' } },
      update: { valuePlain: 'false' },
      create: { orgId, settingKey: 'ai_auto_reply_enabled', valuePlain: 'false' }
    });
    if (input.autoReplyEnabled) {
      logger.warn(`[ai] Ignored attempt to enable autonomous AI auto-reply for org ${orgId}. Auto-reply is locked off.`);
    }
  }

  if (input.intentClassificationEnabled !== undefined) {
    await prisma.appSetting.upsert({
      where: { orgId_settingKey: { orgId, settingKey: 'ai_intent_classification_enabled' } },
      update: { valuePlain: input.intentClassificationEnabled ? 'true' : 'false' },
      create: { orgId, settingKey: 'ai_intent_classification_enabled', valuePlain: input.intentClassificationEnabled ? 'true' : 'false' }
    });
  }

  if (input.systemPrompt !== undefined) {
    const latest = await prisma.aiPromptVersion.findFirst({
      where: { orgId, promptType: 'system' },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    await prisma.aiPromptVersion.updateMany({
      where: { orgId, promptType: 'system', isActive: true },
      data: { isActive: false },
    });
    await prisma.aiPromptVersion.create({
      data: {
        id: randomUUID(),
        orgId,
        promptType: 'system',
        version: (latest?.version || 0) + 1,
        content: input.systemPrompt,
        reason: 'Cập nhật cấu hình AI',
        isActive: true,
      },
    });
    await prisma.appSetting.upsert({
      where: { orgId_settingKey: { orgId, settingKey: 'ai_system_prompt' } },
      update: { valuePlain: input.systemPrompt },
      create: { orgId, settingKey: 'ai_system_prompt', valuePlain: input.systemPrompt }
    });
  }

  return { 
    ...result, 
    autoReplyEnabled: false, 
    intentClassificationEnabled: input.intentClassificationEnabled, 
    systemPrompt: input.systemPrompt 
  };
}

export async function getAiUsage(orgId: string) {
  const currentConfig = await getAiConfig(orgId);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usedToday = await prisma.aiSuggestion.count({ where: { orgId, createdAt: { gte: startOfDay } } });
  return {
    usedToday,
    maxDaily: currentConfig.maxDaily,
    remaining: Math.max(0, currentConfig.maxDaily - usedToday),
    enabled: currentConfig.enabled,
  };
}

async function loadConversation(conversationId: string, orgId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId },
    include: {
      contact: { select: { id: true, fullName: true } },
      messages: {
        where: { isDeleted: false },
        orderBy: { sentAt: 'desc' },
        take: 40,
        select: { senderType: true, senderName: true, content: true, sentAt: true },
      },
    },
  });
  if (!conversation) throw new Error('Conversation not found');
  return { ...conversation, messages: [...conversation.messages].reverse() };
}

async function generateText(provider: string, apiKey: string, model: string, system: string, prompt: string) {
  const providerDef = getProviderConfig(provider);
  const baseUrl = providerDef?.baseUrl || '';

  if (provider === 'anthropic') return generateWithAnthropic(baseUrl, apiKey, model, system, prompt);
  if (provider === 'gemini') return generateWithGemini(baseUrl, apiKey, model, system, prompt);

  /* OpenAI, Qwen, Kimi, OpenRouter — all use OpenAI-compatible chat/completions API */
  if (provider === 'openai') return generateWithOpenaiCompat(`${baseUrl}/v1/chat/completions`, apiKey, model, system, prompt);
  if (provider === 'openrouter') return generateWithOpenaiCompat(`${baseUrl}/chat/completions`, apiKey, model, system, prompt);
  if (provider === 'qwen') return generateWithOpenaiCompat(`${baseUrl}/compatible-mode/v1/chat/completions`, apiKey, model, system, prompt);
  if (provider === 'kimi') return generateWithOpenaiCompat(`${baseUrl}/v1/chat/completions`, apiKey, model, system, prompt);

  /* Native Ollama protocol — api.adsup.vn và local Ollama */
  if (provider === 'ollama_remote') return generateWithOllama(baseUrl, apiKey, model, system, prompt);

  throw new Error(`Unsupported AI provider: ${provider}`);

}

async function saveSuggestion(input: { orgId: string; conversationId: string; messageId?: string; type: AiTaskType; content: string; confidence: number }) {
  return prisma.aiSuggestion.create({
    data: {
      orgId: input.orgId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      type: input.type,
      content: input.content,
      confidence: input.confidence,
    },
  });
}

export async function generateAiOutput(input: { orgId: string; conversationId: string; type: AiTaskType; messageId?: string }) {
  const [currentConfig, conversation] = await Promise.all([
    getAiConfig(input.orgId),
    loadConversation(input.conversationId, input.orgId),
  ]);

  if (!currentConfig.enabled) throw new Error('AI is disabled for this organization');

  // Atomic quota check — count inside transaction to prevent TOCTOU race
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const withinQuota = await prisma.$transaction(async (tx) => {
    const usedToday = await tx.aiSuggestion.count({ where: { orgId: input.orgId, createdAt: { gte: startOfDay } } });
    return usedToday < currentConfig.maxDaily;
  });
  if (!withinQuota) throw new Error('AI daily quota exceeded');

  const apiKey = await getProviderApiKey(input.orgId, currentConfig.provider);
  if (!apiKey) {
    if (input.type === 'sentiment') {
      return { label: 'neutral', confidence: 0, reason: 'AI provider key is not configured' };
    }
    return { content: 'AI chưa được cấu hình. Vui lòng kiểm tra API Key trong cài đặt.', confidence: 0 };
  }

  // Fetch contact's tags and active scenarios
  const contactId = conversation.contact?.id;
  const contactRecord = contactId
    ? await prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          teamId: true,
          assignedUser: { select: { fullName: true } }
        }
      })
    : null;

  // Fetch branch (team)
  const team = (contactRecord && contactRecord.teamId)
    ? await prisma.team.findFirst({
        where: { orgId: input.orgId, id: contactRecord.teamId }
      })
    : null;

  // Fetch interested services (products)
  const customerProducts = contactId
    ? await prisma.customerProduct.findMany({
        where: { customerId: contactId, orgId: input.orgId },
        include: { product: true }
      })
    : [];

  // Fetch appointments
  const appointments = contactId
    ? await prisma.appointment.findMany({
        where: { contactId, orgId: input.orgId },
        orderBy: { appointmentDate: 'desc' },
        take: 5
      })
    : [];

  const contactTags = contactId
    ? await prisma.contactTag.findMany({
        where: { contactId },
        include: { tag: true }
      })
    : [];

  const tagIds = contactTags.map(ct => ct.tagId);
  const activeScenarios = tagIds.length > 0
    ? await prisma.messageScenario.findMany({
        where: {
          orgId: input.orgId,
          triggerTagId: { in: tagIds },
          isActive: true
        },
        include: {
          steps: {
            where: { isActive: true },
            orderBy: { orderIndex: 'asc' }
          }
        }
      })
    : [];

  const profileText = [
    `<customer_profile>`,
    `- Thẻ khách hàng (Tags): ${contactTags.map(ct => ct.tag.name).join(', ') || 'Không có'}`,
    `- Cơ sở phụ trách (Chi nhánh): ${team ? team.name : 'Chưa phân công'}`,
    `- Nhân viên phụ trách: ${contactRecord?.assignedUser?.fullName || 'Chưa phân công'}`,
    `- Dịch vụ quan tâm: ${customerProducts.map(cp => cp.product.name).join(', ') || 'Chưa đăng ký'}`,
    `- Lịch hẹn của khách:`,
    appointments.length > 0
      ? appointments.map(app => `  * Ngày ${app.appointmentDate.toLocaleDateString('vi-VN')} ${app.appointmentTime ? app.appointmentTime : ''} - Trạng thái: ${app.status} (Ghi chú: ${app.notes || 'Không có'})`).join('\n')
      : '  * Chưa có lịch hẹn nào',
    `</customer_profile>`
  ].join('\n');

  const scenariosPromptText = activeScenarios.length > 0
    ? activeScenarios.map(sc => 
        `KỊCH BẢN CHĂM SÓC ĐƯỢC KÍCH HOẠT CHO KHÁCH HÀNG (Hãy chọn kịch bản phù hợp nhất với ngữ cảnh hiện tại và tuân thủ các bước của kịch bản này):\n` +
        `Tên kịch bản: ${sc.name}\n` +
        `Các bước nhắn tin kịch bản:\n` +
        sc.steps.map((st, i) => `- Bước ${i + 1}: ${st.content}`).join('\n')
      ).join('\n\n')
    : '';

  // AI instructions rules about not duplicate booking prompt if appointment status is scheduled
  const aiInstructions = `\n\nHƯỚNG DẪN TRÁNH GỬI NHẦM KỊCH BẢN:\n` +
    `- Đọc kỹ thông tin khách hàng trong <customer_profile>, bao gồm danh sách lịch hẹn.\n` +
    `- Tuyệt đối KHÔNG gửi nhầm kịch bản hoặc gửi lại các bước kịch bản trùng lặp.\n` +
    `- Ví dụ: Nếu danh sách lịch hẹn của khách hàng đã có lịch hẹn ở trạng thái "scheduled" (Đã đặt lịch thành công và chưa diễn ra), tuyệt đối KHÔNG gửi tin nhắn chốt hẹn/hẹn lịch lần đầu cho họ nữa.`;

  const contextText = buildConversationContext(conversation.messages);
  await logAiActivity({
    orgId: input.orgId,
    teamId: contactRecord?.teamId || null,
    contactId: conversation.contact?.id || null,
    conversationId: input.conversationId,
    messageId: input.messageId || null,
    actorType: 'ai',
    actionType: 'ai.read_context',
    inputMessage: contextText.slice(-4000),
    confidence: 1,
    metadata: { messageCount: conversation.messages.length, taskType: input.type },
  });
  const language = detectLanguage(contextText);
  const customerName = conversation.contact?.fullName || 'customer';
  const userPrompt = [
    `<conversation_context>`,
    `Customer: ${customerName}`,
    contextText.slice(-4000),
    `</conversation_context>`,
  ].join('\n');

  const baseReplyPrompt = buildReplyDraftPrompt(language);
  let system = baseReplyPrompt;
  if (input.type === 'reply_draft') {
    const orgSystemPrompt = (currentConfig as any).systemPrompt;
    if (orgSystemPrompt) {
      system += `\n\nKỊCH BẢN TƯ VẤN (BẠN PHẢI TUYỆT ĐỐI TUÂN THỦ KỊCH BẢN NÀY ĐỂ TRẢ LỜI KHÁCH HÀNG):\n${orgSystemPrompt}`;
    }
    system += `\n\n${profileText}`;
    if (scenariosPromptText) {
      system += `\n\n${scenariosPromptText}`;
    }
    system += aiInstructions;

    // Fetch and append Knowledge Base
    const knowledgeItems = await (prisma as any).aiKnowledge.findMany({
      where: { orgId: input.orgId, isActive: true },
      select: { category: true, title: true, content: true }
    });

    const knowledgeBaseString = knowledgeItems.length > 0
      ? knowledgeItems
          .map((item: any) => `[${item.category.toUpperCase()}] ${item.title}:\n${item.content}`)
          .join('\n\n')
      : 'Không có dữ liệu kho kiến thức nào.';

    system += `\n\nKHO KIẾN THỨC CỦA CƠ SỞ (KNOWLEDGE BASE):\n` +
      `<knowledge_base>\n${knowledgeBaseString}\n</knowledge_base>\n\n` +
      `HƯỚNG DẪN TRẢ LỜI DỰA TRÊN KHO KIẾN THỨC:\n` +
      `- Hãy trả lời khách hàng một cách rõ ràng, ngắn gọn, đúng với dữ liệu đã cấu hình trong <knowledge_base>.\n` +
      `- Tuyệt đối KHÔNG tự bịa ra thông tin ngoài dữ liệu đã có trong kho kiến thức (no hallucinations).\n` +
      `- Nếu câu hỏi của khách hàng không thể trả lời được bằng dữ liệu trong <knowledge_base>, hoặc bạn không chắc chắn 100% về câu trả lời, hãy trả về CHÍNH XÁC từ khóa [CANNOT_ANSWER] (không viết kèm bất kỳ từ nào khác).`;
  } else if (input.type === 'summary') {
    system = buildSummaryPrompt(language);
  } else {
    system = buildSentimentPrompt(language);
  }

  const raw = await generateText(currentConfig.provider, apiKey, currentConfig.model, system, userPrompt);

  if (input.type === 'sentiment') {
    let parsed: SentimentResult;
    try {
      parsed = JSON.parse(raw) as SentimentResult;
    } catch {
      parsed = { label: 'neutral', confidence: 0.4, reason: raw };
    }
    const normalized = {
      label: ['positive', 'negative', 'neutral'].includes(parsed.label) ? parsed.label : 'neutral',
      confidence: Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : 0.4,
      reason: parsed.reason || raw,
    };
    await saveSuggestion({
      orgId: input.orgId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      type: 'sentiment',
      content: JSON.stringify(normalized),
      confidence: normalized.confidence,
    });
    await logAiActivity({
      orgId: input.orgId,
      teamId: contactRecord?.teamId || null,
      contactId: conversation.contact?.id || null,
      conversationId: input.conversationId,
      messageId: input.messageId || null,
      actorType: 'ai',
      actionType: 'ai.sentiment',
      inputMessage: contextText.slice(-2000),
      outputMessage: normalized.reason,
      intent: normalized.label,
      confidence: normalized.confidence,
      review: normalized.label === 'negative' ? {
        issueType: 'negative_feedback',
        severity: 'high',
        reason: 'AI phát hiện cảm xúc tiêu cực',
        customerMessage: contextText.slice(-1000),
        aiResponse: normalized.reason,
      } : undefined,
    });
    return normalized;
  }

  const text = raw.trim();

  if (input.type === 'reply_draft' && text.includes('[CANNOT_ANSWER]')) {
    try {
      const contactId = conversation.contact?.id;
      if (contactId) {
        // Find or create 'Cần nhân viên xử lý' Tag
        let tag = await prisma.tag.findFirst({
          where: { orgId: input.orgId, name: 'Cần nhân viên xử lý', isActive: true }
        });
        if (!tag) {
          tag = await prisma.tag.create({
            data: {
              orgId: input.orgId,
              name: 'Cần nhân viên xử lý',
              color: '#F44336',
              description: 'AI không chắc chắn câu trả lời'
            }
          });
        }

        // Attach ContactTag mapping if not already attached
        const existingMapping = await prisma.contactTag.findFirst({
          where: { contactId, tagId: tag.id }
        });
        if (!existingMapping) {
          await prisma.contactTag.create({
            data: { orgId: input.orgId, contactId, tagId: tag.id }
          });

          // Update Contact's JSON tags array
          const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { tags: true, assignedUserId: true, fullName: true }
          });
          let currentTags: string[] = [];
          if (contact?.tags && Array.isArray(contact.tags)) {
            currentTags = contact.tags as string[];
          }
          if (!currentTags.includes('Cần nhân viên xử lý')) {
            currentTags.push('Cần nhân viên xử lý');
            await prisma.contact.update({
              where: { id: contactId },
              data: { tags: currentTags }
            });
          }

          // Broadcast contact update via Socket.IO
          const { zaloPool } = await import('../zalo/zalo-pool.js');
          if (zaloPool.io) {
            const { emitToContactRooms } = await import('../../shared/utils/permission-scope.js');
            const updatedContact = await prisma.contact.findUnique({
              where: { id: contactId },
              include: {
                assignedUser: { select: { id: true, fullName: true, email: true } },
                appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
                contactTags: { include: { tag: true } },
                _count: { select: { conversations: true } },
              }
            });
            if (updatedContact) {
              emitToContactRooms(zaloPool.io, contactId, input.orgId, 'contact:update', updatedContact);
            }
          }

          // Trigger tag-based automation
          try {
            const { triggerTagAutomation } = await import('../contacts/contact-sub-resource-routes.js');
            await triggerTagAutomation(input.orgId, contactId, tag.id);
          } catch (autoErr) {
            logger.error('[AI-Service] Failed to trigger automation for Cần nhân viên xử lý tag:', autoErr);
          }

          // Send Push Notifications to assigned staff or Zalo account authorized users
          const { sendPushNotification } = await import('../notifications/push-service.js');
          const userIds = new Set<string>();

          // 1. If there's an assigned user, notify them
          if (contact?.assignedUserId) {
            const assignedUser = await prisma.user.findFirst({
              where: { id: contact.assignedUserId, orgId: input.orgId, isActive: true },
              select: { id: true }
            });
            if (assignedUser) {
              userIds.add(assignedUser.id);
            }
          }

          // 2. Fallback: Find authorized users for this Zalo Account
          if (userIds.size === 0 && conversation.zaloAccountId) {
            const { getZaloAccountAuthorizedUserIds } = await import('../../shared/utils/permission-scope.js');
            const authorizedUserIds = await getZaloAccountAuthorizedUserIds(conversation.zaloAccountId);
            
            const activeUsers = await prisma.user.findMany({
              where: {
                id: { in: authorizedUserIds },
                orgId: input.orgId,
                isActive: true
              },
              select: { id: true }
            });
            for (const u of activeUsers) {
              userIds.add(u.id);
            }
          }

          // 3. Send notification to identified staff
          for (const userId of userIds) {
            await sendPushNotification(userId, input.orgId, {
              title: `AI không chắc chắn về câu hỏi`,
              body: `Khách hàng ${contact?.fullName || 'ẩn danh'} đặt câu hỏi khó, cần bạn hỗ trợ.`,
              data: {
                conversationId: conversation.id,
                url: `/chat/${conversation.id}`
              }
            });
          }
        }
      }
    } catch (tagErr) {
      logger.error('[AI-Service] Failed to apply Cần nhân viên xử lý tag and notify:', tagErr);
    }
  }

  await saveSuggestion({
    orgId: input.orgId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    type: input.type,
    content: text,
    confidence: text.includes('[CANNOT_ANSWER]') ? 0.0 : 0.8,
  });
  await logAiActivity({
    orgId: input.orgId,
    teamId: contactRecord?.teamId || null,
    contactId: conversation.contact?.id || null,
    conversationId: input.conversationId,
    messageId: input.messageId || null,
    actorType: 'ai',
    actionType: input.type === 'reply_draft' ? 'ai.reply_draft' : `ai.${input.type}`,
    inputMessage: contextText.slice(-3000),
    outputMessage: text,
    confidence: text.includes('[CANNOT_ANSWER]') ? 0.0 : 0.8,
    scenarioName: activeScenarios.map((s) => s.name).join(', ') || null,
    knowledgeSource: input.type === 'reply_draft' ? 'ai_knowledge' : null,
    review: text.includes('[CANNOT_ANSWER]') ? {
      issueType: 'cannot_answer',
      severity: 'high',
      reason: 'AI không tìm được câu trả lời chắc chắn trong kho kiến thức',
      customerMessage: contextText.slice(-1000),
      aiResponse: text,
      suggestedFix: 'Bổ sung kho kiến thức hoặc kịch bản trả lời phù hợp.',
    } : undefined,
  });
  return { content: text, confidence: text.includes('[CANNOT_ANSWER]') ? 0.0 : 0.8 };
}

export async function classifyCustomerIntent(
  orgId: string,
  messageContent: string,
  conversationId?: string
): Promise<{ intent: string; confidence: number; reason: string } | null> {
  try {
    const currentConfig = await getAiConfig(orgId);
    if (!currentConfig.enabled) {
      logger.debug(`[AI-Intent] AI is disabled for organization ${orgId}`);
      return null;
    }

    const apiKey = await getProviderApiKey(orgId, currentConfig.provider);
    if (!apiKey) {
      logger.warn(`[AI-Intent] API key not configured for provider ${currentConfig.provider} in org ${orgId}`);
      return null;
    }

    // Quota Check
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usedToday = await prisma.aiSuggestion.count({ where: { orgId, createdAt: { gte: startOfDay } } });
    if (usedToday >= currentConfig.maxDaily) {
      logger.warn(`[AI-Intent] Daily quota exceeded for org ${orgId}`);
      return null;
    }

    // Find language and build context
    let language: 'vi' | 'en' = detectLanguage(messageContent);
    let contextText = '';
    if (conversationId) {
      try {
        const conversation = await prisma.conversation.findFirst({
          where: { id: conversationId, orgId },
          include: {
            messages: {
              where: { isDeleted: false },
              orderBy: { sentAt: 'desc' },
              take: 5,
              select: { senderType: true, senderName: true, content: true, sentAt: true },
            }
          }
        });
        if (conversation?.messages && conversation.messages.length > 0) {
          const revMessages = [...conversation.messages].reverse();
          contextText = buildConversationContext(revMessages);
          language = detectLanguage(contextText);
        }
      } catch (convErr) {
        logger.error('[AI-Intent] Failed to load conversation context:', convErr);
      }
    }

    const systemPrompt = buildIntentPrompt(language);
    const userPrompt = contextText 
      ? `Last messages context:\n${contextText}\n\nIncoming message to classify: "${messageContent}"`
      : `Incoming message to classify: "${messageContent}"`;

    const raw = await generateText(currentConfig.provider, apiKey, currentConfig.model, systemPrompt, userPrompt);
    
    let parsed: { intent: string; confidence: number; reason: string };
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      // Fallback regex parsing if JSON format is violated
      const intentMatch = raw.match(/"intent"\s*:\s*"([^"]+)"/);
      const confidenceMatch = raw.match(/"confidence"\s*:\s*([0-9.]+)/);
      const reasonMatch = raw.match(/"reason"\s*:\s*"([^"]+)"/);
      parsed = {
        intent: intentMatch ? intentMatch[1] : 'none',
        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
        reason: reasonMatch ? reasonMatch[1] : raw.substring(0, 200)
      };
    }

    const validIntents = [
      'ask_price',
      'ask_service',
      'book_appointment',
      'ask_address',
      'complain',
      'callback_request',
      'difficult_question',
      'none'
    ];

    const result = {
      intent: validIntents.includes(parsed.intent) ? parsed.intent : 'none',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reason: parsed.reason || ''
    };

    // Save to ai suggestions history
    await saveSuggestion({
      orgId,
      conversationId: conversationId || 'intent-only',
      type: 'intent',
      content: JSON.stringify(result),
      confidence: result.confidence
    });

    return result;
  } catch (err) {
    logger.error('[AI-Intent] Error classifying intent:', err);
    return null;
  }
}
