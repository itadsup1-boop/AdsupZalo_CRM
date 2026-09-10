/**
 * Main application entry point.
 * Bootstraps Fastify server with all plugins, Socket.IO, and route handlers.
 * The process never exits — all errors are caught and logged.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import formBody from '@fastify/formbody';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Prisma } from '@prisma/client';
import { config } from './config/index.js';
import { prisma } from './shared/database/prisma-client.js';
import { logger } from './shared/utils/logger.js';
import { authRoutes } from './modules/auth/auth-routes.js';
import { zaloRoutes } from './modules/zalo/zalo-routes.js';
import { chatRoutes } from './modules/chat/chat-routes.js';
import { contactRoutes } from './modules/contacts/contact-routes.js';
import { contactSubResourceRoutes } from './modules/contacts/contact-sub-resource-routes.js';
import { appointmentRoutes } from './modules/contacts/appointment-routes.js';
import { startAppointmentReminder } from './modules/contacts/appointment-reminder.js';
import { dashboardRoutes } from './modules/dashboard/dashboard-routes.js';
import { reportRoutes } from './modules/dashboard/report-routes.js';
import { userRoutes } from './modules/auth/user-routes.js';
import { teamRoutes } from './modules/auth/team-routes.js';
import { orgRoutes } from './modules/auth/org-routes.js';
import { zaloAccessRoutes } from './modules/zalo/zalo-access-routes.js';
import { zaloSyncRoutes } from './modules/zalo/zalo-sync-routes.js';
import { zaloPool } from './modules/zalo/zalo-pool.js';
import { registerZaloSocketHandlers } from './modules/zalo/zalo-socket.js';
import { notificationRoutes } from './modules/notifications/notification-routes.js';
import { searchRoutes } from './modules/search/search-routes.js';
import { startZaloHealthCheck } from './modules/zalo/zalo-health-check.js';
import { publicApiRoutes } from './modules/api/public-api-routes.js';
import { webhookSettingsRoutes } from './modules/api/webhook-settings-routes.js';
import { startContactIntelligence } from './modules/contacts/contact-intelligence.js';
import { analyticsRoutes } from './modules/analytics/analytics-routes.js';
import { savedReportRoutes } from './modules/analytics/saved-report-routes.js';
import { integrationRoutes } from './modules/integrations/integration-routes.js';
import { automationRoutes } from './modules/automation/automation-routes.js';
import { tagsRoutes } from './modules/automation/tags-routes.js';
import { scenariosRoutes } from './modules/automation/scenarios-routes.js';
import { campaignsRoutes } from './modules/automation/campaigns-routes.js';
import { templateRoutes } from './modules/automation/template-routes.js';
import { workflowRoutes } from './modules/automation/workflow-routes.js';
import { aiRoutes } from './modules/ai/ai-routes.js';
import { startAgentSocketClient } from './modules/ai/agent-socket-client.js';
import { chatOperationsRoutes, registerChatSocketHandlers } from './modules/chat/chat-operations-routes.js';
import { groupRoutes } from './modules/zalo/group-routes.js';
import { groupModerationRoutes } from './modules/zalo/group-moderation-routes.js';
import { friendRoutes } from './modules/zalo/friend-routes.js';
import { profileRoutes } from './modules/zalo/profile-routes.js';
import { credentialRoutes } from './modules/zalo/credential-routes.js';
import { aiAgentRoutes } from './modules/api/ai-agent-routes.js';
import { zaloOARoutes } from './modules/zalo-oa/zalo-oa-routes.js';
import { zaloCallRoutes } from './modules/call/zalo-call-routes.js';
import { ingestionRoutes } from './modules/ingestion/ingestion-routes.js';
import { productRoutes } from './modules/products/products-routes.js';
import { eventBuffer } from './shared/event-buffer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function bootstrap() {
  const app = Fastify({ logger: false });

  // ── Plugins ──────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow same origin, extension origins, and configured app URL
      if (!origin) return cb(null, true); // server-to-server
      if (
        origin === config.appUrl ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://') ||
        (!config.isProduction)
      ) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 80 * 1024 * 1024 },
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  await app.register(formBody);

  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
    // Skip rate limiting for static assets — only limit API routes
    allowList: (request: { url: string }) => !request.url.startsWith('/api/'),
  });

  // Serve compiled frontend assets in production
  if (config.isProduction) {
    await app.register(fastifyStatic, {
      root: path.join(__dirname, '../static'),
      prefix: '/',
    });
  }

  // ── Socket.IO ─────────────────────────────────────────────────────────────

  const io = new Server(app.server, {
    cors: {
      origin: config.isProduction ? config.appUrl : '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Redis Adapter for Scaling
  try {
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const { createClient } = await import('redis');
    const pubClient = createClient({ url: config.redisUrl || 'redis://localhost:6379' });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('[app] Socket.IO Redis Adapter connected');
  } catch (err) {
    logger.warn('[app] Redis Adapter failed, falling back to in-memory:', (err as Error).message);
  }

  // Attach io to app so route handlers can emit events
  app.decorate('io', io);

  // Pass io to zalo pool for real-time event emission
  zaloPool.setIO(io);

  // Authenticate socket connections and populate socket.data
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error: Missing token'));
    try {
      const decoded = app.jwt.verify<{ id: string; orgId: string; teamId?: string; role: string }>(token);
      socket.data = {
        userId: decoded.id,
        orgId: decoded.orgId,
        teamId: decoded.teamId,
        role: decoded.role,
      };
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  // Register Zalo Socket.IO event handlers
  registerZaloSocketHandlers(io);

  // Register chat Socket.IO event handlers
  registerChatSocketHandlers(io);

  // Register call Socket.IO event handlers
  const { registerCallSocketHandlers } = await import('./modules/call/call-socket.js');
  registerCallSocketHandlers(io);

  // ── Routes ────────────────────────────────────────────────────────────────

  await app.register(authRoutes);
  await app.register(zaloRoutes);
  await app.register(chatRoutes);
  await app.register(contactRoutes);
  await app.register(contactSubResourceRoutes);
  await app.register(appointmentRoutes);
  await app.register(dashboardRoutes);
  await app.register(reportRoutes);
  await app.register(userRoutes);
  await app.register(teamRoutes);
  await app.register(orgRoutes);
  await app.register(zaloAccessRoutes);
  await app.register(zaloSyncRoutes);
  await app.register(notificationRoutes);
  await app.register(searchRoutes);
  await app.register(publicApiRoutes);
  await app.register(webhookSettingsRoutes);
  await app.register(analyticsRoutes);
  await app.register(savedReportRoutes);
  await app.register(integrationRoutes);
  await app.register(automationRoutes);
  await app.register(tagsRoutes);
  await app.register(scenariosRoutes);
  await app.register(campaignsRoutes);
  await app.register(templateRoutes);
  await app.register(workflowRoutes);
  await app.register(aiRoutes);
  await app.register(ingestionRoutes, { prefix: '/api/v1/ingestion' });
  await app.register(chatOperationsRoutes);
  await app.register(groupRoutes);
  await app.register(groupModerationRoutes);
  await app.register(friendRoutes);
  await app.register(profileRoutes);
  await app.register(credentialRoutes);
  await app.register(zaloOARoutes);
  await app.register(zaloCallRoutes);
  await app.register(ingestionRoutes);
  await app.register(productRoutes);
  await app.register(aiAgentRoutes, { prefix: '/api/v1/ai-agent' });

  // 7.2 Error Tracking: Sentry
  if (config.sentryDsn) {
    const Sentry = await import('@sentry/node');
    Sentry.init({ dsn: config.sentryDsn, environment: config.nodeEnv });
    logger.info('[app] Sentry Error Tracking initialized');
  }

  // 7.1 Prometheus Metrics Endpoint
  app.get('/metrics', async (request, reply) => {
    const { metrics } = await import('./shared/utils/metrics.js');
    reply.type(metrics.contentType).send(await metrics.getMetrics());
  });

  // Liveness/readiness probe — also checks DB connectivity
  app.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'error', db: 'disconnected', timestamp: new Date().toISOString() };
    }
  });

  // API version banner
  app.get('/api/v1/status', async () => {
    return { version: '1.0.0', name: 'Zalo CRM' };
  });

  app.get('/api/v1/files/audio/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const safeName = path.basename(filename);
    if (safeName !== filename) return reply.status(400).send({ error: 'Invalid audio file name' });

    const filePath = path.join(config.uploadDir, 'audio', safeName);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return reply.status(404).send({ error: 'Audio file not found' });
    }
    if (!stat.isFile()) return reply.status(404).send({ error: 'Audio file not found' });

    const ext = path.extname(safeName).toLowerCase();
    const contentTypeByExt: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.mp4': 'audio/mp4',
      '.aac': 'audio/aac',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
    };
    const contentType = contentTypeByExt[ext] || 'application/octet-stream';
    const range = request.headers.range;

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return reply.status(416).header('Content-Range', `bytes */${stat.size}`).send();

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
        return reply.status(416).header('Content-Range', `bytes */${stat.size}`).send();
      }

      const cappedEnd = Math.min(end, stat.size - 1);
      reply
        .status(206)
        .type(contentType)
        .header('Content-Length', String(cappedEnd - start + 1))
        .header('Content-Range', `bytes ${start}-${cappedEnd}/${stat.size}`);
      return reply.send(fs.createReadStream(filePath, { start, end: cappedEnd }));
    }

    reply.type(contentType).header('Content-Length', String(stat.size));
    return reply.send(fs.createReadStream(filePath));
  });

  app.get('/api/v1/files/video/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const safeName = path.basename(filename);
    if (safeName !== filename) return reply.status(400).send({ error: 'Invalid video file name' });

    const filePath = path.join(config.uploadDir, 'video', safeName);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return reply.status(404).send({ error: 'Video file not found' });
    }
    if (!stat.isFile()) return reply.status(404).send({ error: 'Video file not found' });

    const range = request.headers.range;
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return reply.status(416).header('Content-Range', `bytes */${stat.size}`).send();

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
        return reply.status(416).header('Content-Range', `bytes */${stat.size}`).send();
      }

      const cappedEnd = Math.min(end, stat.size - 1);
      reply
        .status(206)
        .type('video/mp4')
        .header('Content-Length', String(cappedEnd - start + 1))
        .header('Content-Range', `bytes ${start}-${cappedEnd}/${stat.size}`);
      return reply.send(fs.createReadStream(filePath, { start, end: cappedEnd }));
    }

    reply.type('video/mp4').header('Content-Length', String(stat.size));
    return reply.send(fs.createReadStream(filePath));
  });

  // SPA fallback — serve index.html for non-API routes in production
  if (config.isProduction) {
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // ── Error handler ─────────────────────────────────────────────────────────

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    logger.error('Request error:', error.message);
    reply.status(error.statusCode ?? 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  // ── Start ─────────────────────────────────────────────────────────────────

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Zalo CRM running on http://${config.host}:${config.port}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    startAppointmentReminder(io);
    startZaloHealthCheck();
    startContactIntelligence();
    await eventBuffer.start(io);

    // Khởi động kết nối Socket Agent Master (Windows)
    startAgentSocketClient(io);

    // Khởi động trình lập lịch gửi tin nhắn tự động (Automation)
    const { startMessageScheduler } = await import('./modules/automation/message-scheduler.js');
    startMessageScheduler();

    // Khởi động trình lập lịch Tag Automation Workflow
    const { startWorkflowScheduler } = await import('./modules/automation/workflow-scheduler.js');
    startWorkflowScheduler();

    // Khởi động trình lập lịch AI tự động (Autonomous AI)
    const { startAutonomousScheduler } = await import('./modules/ai/autonomous-cron.js');
    startAutonomousScheduler();

    // Kích hoạt bộ xử lý tin nhắn từ Robot (Giai đoạn 4)
    const { queueService } = await import('./shared/queue/queue-service.js');
    await queueService.init();
    await queueService.consume('zalo_ingestion_queue', async (data) => {
      const { messageProcessor } = await import('./modules/ingestion/processors/zalo-processors.js');
      await messageProcessor(data);
    });
    logger.info('[app] RabbitMQ Consumer activated for history hydration');
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }

  // Reconnect Zalo accounts that have saved sessions
  try {
    const accounts = await prisma.zaloAccount.findMany({
      where: { sessionData: { not: Prisma.JsonNull } },
      select: { id: true, orgId: true, sessionData: true },
    });
    logger.info(`Attempting reconnect for ${accounts.length} Zalo account(s)`);
    for (const account of accounts) {
      const session = account.sessionData as {
        cookie: any;
        imei: string;
        userAgent: string;
      } | null;
      if (session?.imei) {
        zaloPool.reconnect(account.id, account.orgId, session).catch((err) => {
          logger.warn(`Auto-reconnect failed for account ${account.id}:`, err);
        });
      }
    }
  } catch (err) {
    logger.error('Failed to load accounts for reconnect:', err);
  }
}

// Keep process alive — log but never crash on unhandled errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

bootstrap();
