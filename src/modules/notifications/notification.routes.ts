import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../container';
import { bearer, errorResponses, idParam } from '../../lib/http-schemas';
import { listNotificationsQuery, notificationDto, notificationListResponse } from './notification.schemas';

export const notificationRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const tags = ['Notificações'];

  app.get(
    '/notifications',
    {
      schema: {
        tags,
        summary: 'Central de notificações',
        description:
          'Também avança a simulação dos pedidos em andamento, então pode ser usado em polling para disparar ' +
          'notificações locais (push) quando surgir item não lido novo.',
        security: bearer,
        querystring: listNotificationsQuery,
        response: { 200: notificationListResponse, ...errorResponses(400, 401) },
      },
    },
    async (req) => {
      services.orders.syncUserOrders(req.user.id);
      return services.notifications.list(req.user.id, req.query.unreadOnly, req.query.page, req.query.pageSize);
    },
  );

  app.post(
    '/notifications/:id/read',
    {
      schema: {
        tags,
        summary: 'Marca uma notificação como lida',
        security: bearer,
        params: idParam,
        response: { 200: notificationDto, ...errorResponses(401, 404) },
      },
    },
    async (req) => services.notifications.markRead(req.user.id, req.params.id),
  );

  app.post(
    '/notifications/read-all',
    {
      schema: {
        tags,
        summary: 'Marca todas como lidas',
        security: bearer,
        response: { 200: z.object({ unreadCount: z.number().int() }), ...errorResponses(401) },
      },
    },
    async (req) => services.notifications.markAllRead(req.user.id),
  );
};
