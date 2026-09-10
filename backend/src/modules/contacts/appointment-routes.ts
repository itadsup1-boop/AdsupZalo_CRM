import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  cancelAppointment,
  createAppointment,
  getAppointment,
  listAppointments,
  updateAppointment,
} from '../appointments/appointment-service.js';

type QueryParams = Record<string, string>;

function appointmentError(reply: FastifyReply, err: unknown) {
  const message = err instanceof Error ? err.message : 'Failed to process appointment';
  const status = message.includes('not found') ? 404
    : message.includes('tương tự') ? 409
      : message.includes('không hợp lệ') || message.includes('bắt buộc') || message.includes('quá khứ') ? 400
        : 500;
  return reply.status(status).send({ error: status === 500 ? 'Failed to process appointment' : message });
}

function todayRange() {
  const now = new Date();
  const vietnamNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const start = new Date(vietnamNow.getFullYear(), vietnamNow.getMonth(), vietnamNow.getDate(), 0, 0, 0, 0);
  const end = new Date(vietnamNow.getFullYear(), vietnamNow.getMonth(), vietnamNow.getDate(), 23, 59, 59, 999);
  return { start, end };
}

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const prefixes = ['/api/v1/appointments', '/api/appointments'];

  for (const prefix of prefixes) {
    app.get(`${prefix}/today`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { start, end } = todayRange();
        return await listAppointments(request.user!, {
          ...(request.query as QueryParams),
          dateFrom: start.toISOString(),
          dateTo: end.toISOString(),
        });
      } catch (err) {
        logger.error('[appointments] Today error:', err);
        return appointmentError(reply, err);
      }
    });

    app.get(`${prefix}/upcoming`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return await listAppointments(request.user!, {
          ...(request.query as QueryParams),
          dateFrom: now.toISOString(),
          dateTo: in7Days.toISOString(),
          status: (request.query as QueryParams).status || 'confirmed',
        });
      } catch (err) {
        logger.error('[appointments] Upcoming error:', err);
        return appointmentError(reply, err);
      }
    });

    app.get(prefix, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await listAppointments(request.user!, request.query as QueryParams);
      } catch (err) {
        logger.error('[appointments] List error:', err);
        return appointmentError(reply, err);
      }
    });

    app.get(`${prefix}/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return await getAppointment(request.user!, id);
      } catch (err) {
        logger.error('[appointments] Detail error:', err);
        return appointmentError(reply, err);
      }
    });

    app.post(prefix, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const appointment = await createAppointment(request.user!, request.body as Record<string, unknown>, (app as any).io);
        return reply.status(201).send(appointment);
      } catch (err) {
        logger.error('[appointments] Create error:', err);
        return appointmentError(reply, err);
      }
    });

    app.patch(`${prefix}/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return await updateAppointment(request.user!, id, request.body as Record<string, unknown>);
      } catch (err) {
        logger.error('[appointments] Patch error:', err);
        return appointmentError(reply, err);
      }
    });

    app.put(`${prefix}/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return await updateAppointment(request.user!, id, request.body as Record<string, unknown>);
      } catch (err) {
        logger.error('[appointments] Update error:', err);
        return appointmentError(reply, err);
      }
    });

    app.patch(`${prefix}/:id/cancel`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as { reason?: string };
        return await cancelAppointment(request.user!, id, body?.reason);
      } catch (err) {
        logger.error('[appointments] Cancel error:', err);
        return appointmentError(reply, err);
      }
    });

    app.delete(`${prefix}/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params as { id: string };
        return await cancelAppointment(request.user!, id, 'Huỷ qua API DELETE');
      } catch (err) {
        logger.error('[appointments] Delete/cancel error:', err);
        return appointmentError(reply, err);
      }
    });
  }
}
