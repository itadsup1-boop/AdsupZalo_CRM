/**
 * Periodic safety net for Zalo message sync.
 * Realtime listener remains primary, but this job periodically asks Zalo for old
 * messages and imports group history by checkpoint to cover missed websocket events.
 */
import { logger } from '../../shared/utils/logger.js';
import { runZaloMessageBackfill } from './zalo-message-backfill.js';

const SYNC_INTERVAL_MS = 2 * 60_000;
const syncIntervals = new Map<string, ReturnType<typeof setInterval>>();

export function startMessageSync(api: any, accountId: string, orgId?: string): void {
  if (syncIntervals.has(accountId)) return;

  const interval = setInterval(async () => {
    try {
      const stats = await runZaloMessageBackfill({
        accountId,
        orgId,
        api,
        lookbackHours: 1,
        requestOldMessages: true,
        reason: 'periodic',
      });
      if (stats.messagesImported > 0 || stats.errors.length > 0) {
        logger.info(
          `[sync:${accountId}] Periodic message sync: ${stats.messagesImported} imported, ${stats.duplicatesSkipped} duplicate, ${stats.conversationsScanned} conversations, ${stats.errors.length} errors`,
        );
      }
    } catch (err) {
      logger.warn(`[sync:${accountId}] Periodic sync error:`, err);
    }
  }, SYNC_INTERVAL_MS);

  syncIntervals.set(accountId, interval);
  logger.info(`[sync:${accountId}] Started message backfill sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
}

export function stopMessageSync(accountId: string): void {
  const interval = syncIntervals.get(accountId);
  if (interval) {
    clearInterval(interval);
    syncIntervals.delete(accountId);
    logger.info(`[sync:${accountId}] Stopped message backfill sync`);
  }
}
