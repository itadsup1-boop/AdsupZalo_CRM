import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { executeCurrentNode } from './workflow-executor.js';

let schedulerTask: cron.ScheduledTask | null = null;

export function startWorkflowScheduler() {
  if (schedulerTask) return;

  // Chạy mỗi phút
  schedulerTask = cron.schedule('* * * * *', async () => {
    try {
      await processPendingRuns();
    } catch (error) {
      logger.error('[workflow-scheduler] Error processing runs:', error);
    }
  });

  logger.info('[workflow-scheduler] Started cron job (runs every minute)');
}

async function processPendingRuns() {
  const now = new Date();

  // Tìm các AutomationRun đang ở trạng thái 'running' và đã đến giờ scheduledAt
  const pendingRuns = await prisma.automationRun.findMany({
    where: {
      status: 'running',
      scheduledAt: {
        lte: now,
      },
    },
    include: {
      workflow: true,
      contact: true,
    },
    take: 100, // Process batch
  });

  if (pendingRuns.length === 0) return;

  logger.info(`[workflow-scheduler] Found ${pendingRuns.length} pending runs to process`);

  for (const run of pendingRuns) {
    logger.info(`[workflow-scheduler] Processing run ${run.id} for contact ${run.contactId}`);
    try {
      await executeCurrentNode({
        ...run,
        state: run.state as Record<string, unknown>,
        workflow: { nodes: run.workflow.nodes, edges: run.workflow.edges },
      });
    } catch (error) {
      logger.error(`[workflow-scheduler] Failed to execute run ${run.id}:`, error);
    }
  }
}
