import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { bearer, errorResponses, idParam } from '../../lib/http-schemas';
import type { Services } from '../../container';
import { createPaymentMethodBody, paymentMethodDto } from './payment-method.schemas';

export const paymentMethodRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const tags = ['Formas de pagamento'];

  app.get(
    '/payment-methods',
    {
      schema: {
        tags,
        summary: 'Lista as formas de pagamento do usuário',
        security: bearer,
        response: { 200: z.object({ data: z.array(paymentMethodDto) }), ...errorResponses(401) },
      },
    },
    async (req) => ({ data: services.paymentMethods.list(req.user.id) }),
  );

  app.post(
    '/payment-methods',
    {
      schema: {
        tags,
        summary: 'Cadastra forma de pagamento',
        description:
          'Para cartões, envie apenas bandeira e 4 últimos dígitos — o número completo nunca trafega nem é armazenado. PIX e dinheiro só podem existir uma vez.',
        security: bearer,
        body: createPaymentMethodBody,
        response: { 201: paymentMethodDto, ...errorResponses(400, 401, 409) },
      },
    },
    async (req, reply) => reply.status(201).send(services.paymentMethods.create(req.user.id, req.body)),
  );

  app.delete(
    '/payment-methods/:id',
    {
      schema: {
        tags,
        summary: 'Remove forma de pagamento',
        security: bearer,
        params: idParam,
        response: { 204: z.null().describe('Sem conteúdo'), ...errorResponses(401, 404) },
      },
    },
    async (req, reply) => {
      services.paymentMethods.remove(req.user.id, req.params.id);
      return reply.status(204).send(null);
    },
  );
};
