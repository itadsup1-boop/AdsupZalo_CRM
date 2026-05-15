import webpush from 'web-push';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';

if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey
  );
}

export async function sendPushNotification(userId: string, orgId: string, payload: any) {
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
      logger.warn(`[push] Failed to send ${failed.length} notifications for user ${userId}`);
    }
  } catch (err) {
    logger.error('[push] Error sending push notification:', err);
  }
}
