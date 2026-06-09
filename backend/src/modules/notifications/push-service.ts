import webpush from 'web-push';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';

// Khởi tạo an toàn Web Push
if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey
  );
}

// Khởi tạo an toàn Firebase Admin SDK để tránh crash nếu chưa cấu hình service-account.json
let messaging: admin.messaging.Messaging | null = null;

try {
  const certPath = path.resolve(process.cwd(), 'service-account.json');
  if (fs.existsSync(certPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(certPath)
    });
    messaging = admin.messaging();
    logger.info('[fcm] Firebase Admin SDK initialized successfully');
  } else {
    logger.warn('[fcm] service-account.json not found in current directory. FCM push notifications are disabled.');
  }
} catch (err) {
  logger.error('[fcm] Failed to initialize Firebase Admin SDK:', err);
}

/**
 * Gửi thông báo đẩy qua Firebase Cloud Messaging (FCM) đến các thiết bị Android/iOS đăng ký
 */
export async function sendFcmNotification(userId: string, orgId: string, payload: { title: string; body: string; url: string }) {
  if (!messaging) return;

  try {
    const db = getTenantPrisma(orgId);
    const fcmTokens = await db.fcmToken.findMany({
      where: { userId }
    });

    if (fcmTokens.length === 0) return;

    const tokens = fcmTokens.map((t) => t.token);

    const message = {
      tokens: tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        title: payload.title,
        body: payload.body,
        url: payload.url,
      },
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        }
      }
    };

    const response = await messaging.sendEachForMulticast(message);

    if (response.failureCount > 0) {
      const expiredTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === 'messaging/invalid-argument' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            expiredTokens.push(tokens[idx]);
          }
        }
      });

      if (expiredTokens.length > 0) {
        await db.fcmToken.deleteMany({
          where: { token: { in: expiredTokens } }
        });
        logger.info(`[fcm] Cleaned up ${expiredTokens.length} expired FCM tokens.`);
      }
    }
  } catch (err) {
    logger.error('[fcm] Error sending FCM notification:', err);
  }
}

/**
 * Gửi thông báo đẩy qua cả WebPush và FCM
 */
export async function sendPushNotification(userId: string, orgId: string, payload: any) {
  // 1. Tự động gửi qua kênh FCM nếu có cấu hình
  if (messaging) {
    void sendFcmNotification(userId, orgId, {
      title: payload.title || 'Tin nhắn mới',
      body: payload.body || 'Bạn có tin nhắn mới',
      url: payload.data?.url || '/chat'
    });
  }

  // 2. Gửi qua kênh WebPush (Service Worker trình duyệt) truyền thống
  try {
    const db = getTenantPrisma(orgId);
    const subscriptions = await db.pushSubscription.findMany({
      where: { userId }
    });

    if (subscriptions.length === 0) return;

    const pushPayload = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys as any
            },
            pushPayload
          );
        } catch (err: any) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            // Subscription has expired or is no longer valid
            await db.pushSubscription.delete({ where: { id: sub.id } });
            logger.info(`[push] Deleted expired subscription: ${sub.id}`);
          } else {
            throw err;
          }
        }
      })
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      logger.warn(`[push] Failed to send ${failed.length} WebPush notifications for user ${userId}`);
    }
  } catch (err) {
    logger.error('[push] Error sending WebPush notification:', err);
  }
}
