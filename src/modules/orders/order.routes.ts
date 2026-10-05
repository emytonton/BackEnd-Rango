import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../container';
import { bearer, errorResponses } from '../../lib/http-schemas';
import {
  createOrderBody,
  listOrdersQuery,
  orderCodeParam,
  orderDetailDto,
  orderListResponse,
  reorderResponse,
} from './order.schemas';

export const orderRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const tags = ['Pedidos'];

  app.post(
    '/orders',
    {
      schema: {
        tags,
        summary: 'Confirma o pedido (checkout) a partir do carrinho',
        description:
          'Usa itens, cupom e totais do carrinho do servidor. Em caso de sucesso o carrinho é esvaziado e é criada ' +
          'a notificação "Seu pedido foi confirmado". Erros de regra: EMPTY_CART, ADDRESS_REQUIRED, ' +
          'PRODUCT_UNAVAILABLE, INVALID_CHANGE.',
        security: bearer,
        body: createOrderBody,
        response: { 201: orderDetailDto, ...errorResponses(400, 401, 404, 422) },
      },
    },
    async (req, reply) => reply.status(201).send(services.orders.create(req.user.id, req.body)),
  );

  app.get(
    '/orders',
    {
      schema: {
        tags,
        summary: 'Histórico de pedidos ("Meus pedidos")',
        security: bearer,
        querystring: listOrdersQuery,
        response: { 200: orderListResponse, ...errorResponses(400, 401) },
      },
    },
    async (req) => services.orders.list(req.user.id, req.query.group, req.query.page, req.query.pageSize),
  );

  app.get(
    '/orders/:id',
    {
      schema: {
        tags,
        summary: 'Detalhes e acompanhamento (timeline) do pedido',
        description:
          'Para a tela de acompanhamento, faça polling deste endpoint (ex.: a cada 5-10 s) enquanto `status = live`.',
        security: bearer,
        params: orderCodeParam,
        response: { 200: orderDetailDto, ...errorResponses(400, 401, 404) },
      },
    },
    async (req) => services.orders.get(req.user.id, req.params.id),
  );

  app.post(
    '/orders/:id/cancel',
    {
      schema: {
        tags,
        summary: 'Cancela o pedido (somente até a confirmação pelo restaurante)',
        security: bearer,
        params: orderCodeParam,
        response: { 200: orderDetailDto, ...errorResponses(400, 401, 404, 422) },
      },
    },
    async (req) => services.orders.cancel(req.user.id, req.params.id),
  );

  app.post(
    '/orders/:id/reorder',
    {
      schema: {
        tags,
        summary: '"Pedir novamente": substitui o carrinho pelos itens do pedido',
        security: bearer,
        params: orderCodeParam,
        response: { 200: reorderResponse, ...errorResponses(400, 401, 404) },
      },
    },
    async (req) => services.orders.reorder(req.user.id, req.params.id),
  );
};
