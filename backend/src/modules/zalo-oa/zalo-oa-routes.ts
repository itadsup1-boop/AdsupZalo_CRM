import type { FastifyInstance } from 'fastify';
import axios from 'axios';
import { authMiddleware } from '../auth/auth-middleware.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOAService } from './zalo-oa-service.js';
import { handleOAWebhook } from './zalo-oa-webhook-handler.js';
import { config } from '../../config/index.js';

export async function zaloOARoutes(app: FastifyInstance): Promise<void> {
  
  // ── Public Routes ────────────────────────────────────────────────────────
  
  /**
   * Zalo OA OAuth Callback
   */
  app.get('/api/v1/zalo-oa/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    
    if (!code || !state) {
      return reply.status(400).send({ error: 'Missing code or state' });
    }

    // state contains the oaAccountId and orgId (JSON or encoded)
    try {
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      const { oaAccountId, orgId } = decodedState;

      const db = getTenantPrisma(orgId);
      const account = await db.zaloOAAccount.findUnique({ where: { id: oaAccountId } });

      if (!account) {
        throw new Error('Account not found during callback');
      }

      // Exchange code for tokens
      const response = await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        new URLSearchParams({
          code,
          app_id: account.appId,
          grant_type: 'authorization_code',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: account.appSecret,
          },
        }
      );

      const data = response.data;
      if (data.error) {
        throw new Error(data.error_description || data.message);
      }

      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      // Update account with tokens
      await db.zaloOAAccount.update({
        where: { id: oaAccountId },
        data: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          tokenExpiresAt: expiresAt,
          status: 'connected',
        },
      });

      // Get profile info to update name/avatar
      try {
        const profile = await zaloOAService.getOAProfile(oaAccountId, orgId);
        await db.zaloOAAccount.update({
          where: { id: oaAccountId },
          data: {
            oaId: profile.oa_id,
            name: profile.name,
            avatarUrl: profile.avatar,
          },
        });
      } catch (e) {
        logger.warn('[ZaloOA] Could not fetch profile after auth:', e);
      }

      // Redirect back to frontend
      return reply.redirect(`${config.appUrl}/zalo-oa?oa_status=success`);
    } catch (error: any) {
      logger.error(`[ZaloOA] Callback error: ${error.message}`);
      return reply.redirect(`${config.appUrl}/zalo-oa?oa_status=error&message=${encodeURIComponent(error.message)}`);
    }
  });

  /**
   * Zalo OA Webhook
   */
  app.post('/api/v1/zalo-oa/webhook', async (request, reply) => {
    const body = request.body as any;
    
    // Process webhook in background
    handleOAWebhook(body, app.io).catch(err => {
      logger.error('[ZaloOA] Webhook processing error:', err);
    });
    
    return { status: 'ok' };
  });

  // ── Authenticated Routes ──────────────────────────────────────────────────
  
  app.register(async (authGroup) => {
    authGroup.addHook('preHandler', authMiddleware);

    /**
     * List OA accounts
     */
    authGroup.get('/api/v1/zalo-oa/accounts', async (request) => {
      const user = request.user!;
      const db = getTenantPrisma(user.orgId);

      return db.zaloOAAccount.findMany({
        where: { orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
      });
    });

    /**
     * Add a new OA account configuration
     */
    authGroup.post<{ Body: { appId: string; appSecret: string } }>(
      '/api/v1/zalo-oa/accounts',
      async (request, reply) => {
        const user = request.user!;
        const { appId, appSecret } = request.body;

        if (!appId || !appSecret) {
          return reply.status(400).send({ error: 'App ID and App Secret are required' });
        }

        const db = getTenantPrisma(user.orgId);
        const account = await db.zaloOAAccount.create({
          data: {
            orgId: user.orgId,
            appId,
            appSecret,
            status: 'disconnected',
          },
        });

        return reply.status(201).send(account);
      }
    );

    /**
     * Get Authorization URL
     */
    authGroup.get<{ Params: { id: string } }>(
      '/api/v1/zalo-oa/authorize/:id',
      async (request) => {
        const { id } = request.params;
        const user = request.user!;
        
        const state = Buffer.from(JSON.stringify({
          oaAccountId: id,
          orgId: user.orgId
        })).toString('base64');

        const db = getTenantPrisma(user.orgId);
        const account = await db.zaloOAAccount.findUnique({ where: { id } });
        
        if (!account) throw new Error('Account not found');

        const callbackUrl = `${config.appUrl.replace(':3000', ':8080')}/api/v1/zalo-oa/callback`;
        
        const authUrl = `https://oauth.zaloapp.com/v4/oa/permission?app_id=${account.appId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}`;
        
        return { authUrl };
      }
    );

    /**
     * Delete OA account
     */
    authGroup.delete<{ Params: { id: string } }>(
      '/api/v1/zalo-oa/accounts/:id',
      async (request, reply) => {
        const { id } = request.params;
        const user = request.user!;
        const db = getTenantPrisma(user.orgId);

        await db.zaloOAAccount.delete({
          where: { id, orgId: user.orgId },
        });

        return reply.status(204).send();
      }
    );
  });
}
