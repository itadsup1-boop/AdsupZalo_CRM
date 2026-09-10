import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';

export interface AntiSpamConfig {
  enabled: boolean;
  quietHoursStart: string; // "HH:MM"
  quietHoursEnd: string;   // "HH:MM"
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  recentReplyThresholdMinutes: number;
  duplicateThresholdHours: number;
}

export async function getAntiSpamConfig(orgId: string): Promise<AntiSpamConfig> {
  const db = getTenantPrisma(orgId);
  try {
    const setting = await db.appSetting.findUnique({
      where: { orgId_settingKey: { orgId, settingKey: 'anti_spam_settings' } }
    });
    if (setting && setting.valuePlain) {
      return JSON.parse(setting.valuePlain);
    }
  } catch (err) {
    logger.error(`[anti-spam] Failed to read settings for org ${orgId}:`, err);
  }
  return {
    enabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    maxMessagesPerHour: 3,
    maxMessagesPerDay: 10,
    recentReplyThresholdMinutes: 15,
    duplicateThresholdHours: 24,
  };
}

export async function checkSpamLimits(
  orgId: string,
  contactId: string,
  content: string
): Promise<{ allowed: boolean; reason?: string; action?: 'skip' | 'wait' }> {
  try {
    const config = await getAntiSpamConfig(orgId);
    if (!config.enabled) {
      return { allowed: true };
    }

    const db = getTenantPrisma(orgId);

    // 1. Quiet Hours check
    if (config.quietHoursStart && config.quietHoursEnd) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      const [startH, startM] = config.quietHoursStart.split(':').map(Number);
      const [endH, endM] = config.quietHoursEnd.split(':').map(Number);
      const startMinutes = (Number.isNaN(startH) ? 22 : startH) * 60 + (Number.isNaN(startM) ? 0 : startM);
      const endMinutes = (Number.isNaN(endH) ? 8 : endH) * 60 + (Number.isNaN(endM) ? 0 : endM);

      let inQuietHours = false;
      if (startMinutes > endMinutes) {
        // Overnight, e.g. 22:00 to 08:00
        inQuietHours = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      } else {
        // Same day, e.g. 12:00 to 13:00
        inQuietHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      }

      if (inQuietHours) {
        return {
          allowed: false,
          reason: `Trong khung giờ cấm gửi (${config.quietHoursStart} - ${config.quietHoursEnd})`,
          action: 'wait'
        };
      }
    }

    // 2. Customer recently replied (active check)
    if (config.recentReplyThresholdMinutes > 0) {
      const thresholdDate = new Date(Date.now() - config.recentReplyThresholdMinutes * 60 * 1000);
      const lastCustomerMsg = await db.message.findFirst({
        where: {
          conversation: { contactId },
          senderType: 'customer',
          sentAt: { gte: thresholdDate }
        }
      });
      if (lastCustomerMsg) {
        return {
          allowed: false,
          reason: `Khách hàng vừa phản hồi lúc ${lastCustomerMsg.sentAt.toLocaleTimeString('vi-VN')}`,
          action: 'skip'
        };
      }
    }

    // 3. Duplicate content check
    if (config.duplicateThresholdHours > 0 && content && content.trim()) {
      const thresholdDate = new Date(Date.now() - config.duplicateThresholdHours * 60 * 60 * 1000);
      const normalizedContent = content.trim();
      const duplicateMsg = await db.message.findFirst({
        where: {
          conversation: { contactId },
          content: normalizedContent,
          senderType: 'self',
          sentAt: { gte: thresholdDate }
        }
      });
      if (duplicateMsg) {
        return {
          allowed: false,
          reason: `Trùng nội dung đã gửi gần đây (Tin nhắn ID: ${duplicateMsg.id.slice(0, 8)})`,
          action: 'skip'
        };
      }
    }

    // 4. Cap limits (hourly and daily)
    if (config.maxMessagesPerHour > 0) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const hourCount = await db.message.count({
        where: {
          conversation: { contactId },
          senderType: 'self',
          sentAt: { gte: oneHourAgo }
        }
      });
      if (hourCount >= config.maxMessagesPerHour) {
        return {
          allowed: false,
          reason: `Vượt quá giới hạn số tin nhắn mỗi giờ (${hourCount}/${config.maxMessagesPerHour})`,
          action: 'skip'
        };
      }
    }

    if (config.maxMessagesPerDay > 0) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dayCount = await db.message.count({
        where: {
          conversation: { contactId },
          senderType: 'self',
          sentAt: { gte: oneDayAgo }
        }
      });
      if (dayCount >= config.maxMessagesPerDay) {
        return {
          allowed: false,
          reason: `Vượt quá giới hạn số tin nhắn mỗi ngày (${dayCount}/${config.maxMessagesPerDay})`,
          action: 'skip'
        };
      }
    }

    return { allowed: true };
  } catch (err) {
    logger.error('[anti-spam] Error checking spam limits:', err);
    return { allowed: true }; // Fallback to allow if any db/runtime error happens to prevent blocking the app
  }
}
