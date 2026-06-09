import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloCallService } from './zalo-call-service.js';
import { logger } from '../../shared/utils/logger.js';

export async function zaloCallRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /api/v1/zalo-call/webhook
   * PUBLIC endpoint — Zalo pushes call status events here (no auth required)
   * Register this URL in Zalo OA Developer portal → Call Center → Webhook URL:
   *   https://crm.adsup.vn/api/v1/zalo-call/webhook
   */
  app.post<{ Body: any }>(
    '/api/v1/zalo-call/webhook',
    async (request, reply) => {
      const body = request.body;
      logger.info(`[ZaloCallWebhook] Received event: ${JSON.stringify(body)}`);

      try {
        const event = body?.data || body;
        if (event) {
          await zaloCallService.handleCallWebhookByOaId(
            body?.oa_id || body?.app_id,
            {
              call_id: event.call_id,
              status: event.event_name || event.status,
              duration: event.duration,
              recording_url: event.recording_url
            }
          );
        }
        return reply.status(200).send({ error: 0, message: 'ok' });
      } catch (err: any) {
        logger.error(`[ZaloCallWebhook] Error: ${err.message}`);
        return reply.status(200).send({ error: 0, message: 'ok' }); // always 200 to Zalo
      }
    }
  );

  // ── Authenticated routes ──────────────────────────────────────────────────
  app.register(async (authGroup) => {
    authGroup.addHook('preHandler', authMiddleware);

    /**
     * GET /api/v1/zalo-call/consent-status
     */
    authGroup.get<{ Querystring: { customerId: string } }>(
      '/api/v1/zalo-call/consent-status',
      async (request, reply) => {
        const user = request.user!;
        const { customerId } = request.query;
        if (!customerId) return reply.status(400).send({ error: 'customerId required' });
        try {
          return await zaloCallService.getConsentStatus(customerId, user.orgId);
        } catch (err: any) {
          return reply.status(500).send({ error: err.message });
        }
      }
    );

    /**
     * POST /api/v1/zalo-call/request-consent
     */
    authGroup.post<{ Body: { customerId: string } }>(
      '/api/v1/zalo-call/request-consent',
      async (request, reply) => {
        const user = request.user!;
        const { customerId } = request.body;
        if (!customerId) return reply.status(400).send({ error: 'customerId required' });
        try {
          return await zaloCallService.requestConsent(customerId, user.id, user.orgId);
        } catch (err: any) {
          return reply.status(500).send({ error: err.message });
        }
      }
    );

    /**
     * POST /api/v1/zalo-call/call
     */
    authGroup.post<{ Body: { customerId: string } }>(
      '/api/v1/zalo-call/call',
      async (request, reply) => {
        const user = request.user!;
        const { customerId } = request.body;
        if (!customerId) return reply.status(400).send({ error: 'customerId required' });
        try {
          return await zaloCallService.makeCall(customerId, user.id, user.orgId);
        } catch (err: any) {
          return reply.status(500).send({ error: err.message });
        }
      }
    );

    /**
     * GET /api/v1/zalo-call/history
     */
    authGroup.get<{ Querystring: { customerId: string } }>(
      '/api/v1/zalo-call/history',
      async (request, reply) => {
        const user = request.user!;
        const { customerId } = request.query;
        if (!customerId) return reply.status(400).send({ error: 'customerId required' });
        try {
          return await zaloCallService.getCallHistory(customerId, user.orgId);
        } catch (err: any) {
          return reply.status(500).send({ error: err.message });
        }
      }
    );
  });
}
