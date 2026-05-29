import axios from 'axios';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';

export class ZaloOAService {
  private static instance: ZaloOAService;

  private constructor() {}

  public static getInstance(): ZaloOAService {
    if (!ZaloOAService.instance) {
      ZaloOAService.instance = new ZaloOAService();
    }
    return ZaloOAService.instance;
  }

  /**
   * Get a valid access token for an OA account.
   * If the current token is expired, it will try to refresh it.
   */
  async getAccessToken(oaAccountId: string, orgId: string): Promise<string> {
    const db = getTenantPrisma(orgId);
    const account = await db.zaloOAAccount.findUnique({
      where: { id: oaAccountId },
    });

    if (!account) {
      throw new Error('Zalo OA account not found');
    }

    // Check if token is still valid (with 5 min buffer)
    const now = new Date();
    if (account.accessToken && account.tokenExpiresAt && account.tokenExpiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
      return account.accessToken;
    }

    // Need to refresh
    if (!account.refreshToken) {
      throw new Error('No refresh token available. Please re-authorize the OA.');
    }

    return this.refreshAccessToken(oaAccountId, orgId, account.appId, account.appSecret, account.refreshToken);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    oaAccountId: string,
    orgId: string,
    appId: string,
    appSecret: string,
    refreshToken: string
  ): Promise<string> {
    try {
      const response = await axios.post(
        'https://oauth.zaloapp.com/v4/oa/access_token',
        new URLSearchParams({
          refresh_token: refreshToken,
          app_id: appId,
          grant_type: 'refresh_token',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            secret_key: appSecret,
          },
        }
      );

      const data = response.data;
      if (data.error) {
        logger.error(`[ZaloOA] Refresh token error: ${data.error_description || data.message}`);
        throw new Error(data.error_description || data.message);
      }

      const db = getTenantPrisma(orgId);
      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      await db.zaloOAAccount.update({
        where: { id: oaAccountId },
        data: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          tokenExpiresAt: expiresAt,
          status: 'connected',
        },
      });

      return data.access_token;
    } catch (error: any) {
      logger.error(`[ZaloOA] Failed to refresh token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a text message via Zalo OA
   */
  async sendTextMessage(
    oaAccountId: string, 
    orgId: string, 
    recipientId: string, 
    text: string
  ): Promise<any> {
    const accessToken = await this.getAccessToken(oaAccountId, orgId);

    try {
      const response = await axios.post(
        'https://openapi.zalo.me/v3.0/oa/message/cs',
        {
          recipient: { user_id: recipientId },
          message: { text },
        },
        {
          headers: { access_token: accessToken },
        }
      );

      if (response.data.error !== 0) {
        throw new Error(`Zalo API Error: ${response.data.message} (code: ${response.data.error})`);
      }

      return response.data;
    } catch (error: any) {
      logger.error(`[ZaloOA] Send message error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get OA Profile information
   */
  async getOAProfile(oaAccountId: string, orgId: string): Promise<any> {
    const accessToken = await this.getAccessToken(oaAccountId, orgId);

    try {
      const response = await axios.get('https://openapi.zalo.me/v2.0/oa/getoa', {
        headers: { access_token: accessToken },
      });

      if (response.data.error !== 0) {
        throw new Error(`Zalo API Error: ${response.data.message}`);
      }

      return response.data.data;
    } catch (error: any) {
      logger.error(`[ZaloOA] Get profile error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a follower/user's profile by their user_id (Zalo OA API v3)
   */
  async getUserProfile(oaAccountId: string, orgId: string, userId: string): Promise<{ name: string; avatar: string } | null> {
    try {
      const accessToken = await this.getAccessToken(oaAccountId, orgId);
      logger.info(`[ZaloOA] Fetching profile for user ${userId} using OA ${oaAccountId}`);
      
      const response = await axios.get('https://openapi.zalo.me/v3.0/oa/user/detail', {
        headers: { access_token: accessToken },
        params: { data: JSON.stringify({ user_id: userId }) },
      });

      logger.info(`[ZaloOA] getUserProfile v3 response: ${JSON.stringify(response.data)}`);

      if (response.data.error !== 0) {
        logger.warn(`[ZaloOA] getUserProfile v3 error code ${response.data.error}: ${response.data.message}`);
        return null;
      }

      const data = response.data.data;
      return {
        name: data.display_name || data.name || 'Khách hàng OA',
        avatar: data.avatar || '',
      };
    } catch (error: any) {
      logger.error(`[ZaloOA] Could not fetch user profile for ${userId}: ${error.message}`);
      if (error.response) {
        logger.error(`[ZaloOA] Error response body: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }
}

export const zaloOAService = ZaloOAService.getInstance();
