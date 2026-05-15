/**
 * Auth routes — setup, join, login, and profile endpoints.
 * Registered as a Fastify plugin via app.register(authRoutes).
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from './auth-middleware.js';
import {
  checkSetupStatus,
  setup,
  join,
  requestToJoin,
  login,
  getProfile,
} from './auth-service.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/setup/status — check if first-run setup is needed
  app.get('/api/v1/setup/status', async () => {
    return checkSetupStatus();
  });

  // POST /api/v1/setup — create org + owner user, return JWT
  app.post<{
    Body: { orgName: string; fullName: string; email: string; password: string };
  }>('/api/v1/setup', async (request, reply) => {
    const { orgName, fullName, email, password } = request.body;
    if (!orgName || !fullName || !email || !password) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }
    const payload = await setup(orgName, fullName, email, password);
    const token = app.jwt.sign(payload, { expiresIn: '7d' });
    return { token, user: payload };
  });

  // POST /api/v1/join — join existing org via secure token, return JWT (INSTANT)
  app.post<{
    Body: { token: string; fullName: string; email: string; password: string };
  }>('/api/v1/join', async (request, reply) => {
    const { token, fullName, email, password } = request.body;
    if (!token || !fullName || !email || !password) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }
    const payload = await join(token, fullName, email, password);
    const jwtToken = app.jwt.sign(payload, { expiresIn: '7d' });
    return { token: jwtToken, user: payload };
  });

  // POST /api/v1/join-request — request to join via ORG NAME (NEEDS APPROVAL)
  app.post<{
    Body: { orgName: string; fullName: string; email: string; password: string };
  }>('/api/v1/join-request', async (request, reply) => {
    const { orgName, fullName, email, password } = request.body;
    if (!orgName || !fullName || !email || !password) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }
    await requestToJoin(orgName, fullName, email, password);
    return { message: 'Yêu cầu của bạn đã được gửi. Vui lòng chờ quản trị viên phê duyệt.' };
  });

  // POST /api/v1/auth/login — verify credentials, return JWT
  app.post<{
    Body: { email: string; password: string };
  }>('/api/v1/auth/login', async (request, reply) => {
    const { email, password } = request.body;
    if (!email || !password) {
      return reply.status(400).send({ error: 'Missing email or password' });
    }
    const payload = await login(email, password);
    const token = app.jwt.sign(payload, { expiresIn: '7d' });
    return { token, user: payload };
  });

  // GET /api/v1/profile — return current user (requires auth)
  app.get('/api/v1/profile', { preHandler: authMiddleware }, async (request) => {
    const user = request.user as { id: string; email: string; role: string; orgId: string };
    return getProfile(user.orgId, user.id);
  });
}
