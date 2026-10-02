import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../container';
import { bearer, errorResponses, idParam } from '../../lib/http-schemas';
import { addCartItemBody, cartDto, couponBody, updateCartItemBody } from './cart.schemas';

export const cartRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const tags = ['Carrinho'];
  const ok = { 200: cartDto };

  app.get(
    '/cart',
    {
      schema: {
        tags,
        summary: 'Carrinho atual com totais calculados',
        description: 'Todas as operações do carrinho devolvem o carrinho completo atualizado.',
        security: bearer,
        response: { ...ok, ...errorResponses(401) },
      },
    },
    async (req) => services.cart.get(req.user.id),
  );

  app.post(
    '/cart/items',
    {
      schema: {
        tags,
        summary: 'Adiciona produto ao carrinho',
        description: 'Se já houver o mesmo produto com os mesmos adicionais, soma a quantidade na linha existente.',
        security: bearer,
        body: addCartItemBody,
        response: { 201: cartDto, ...errorResponses(400, 401, 404, 422) },
      },
    },
    async (req, reply) => reply.status(201).send(services.cart.addItem(req.user.id, req.body)),
  );

  app.patch(
    '/cart/items/:id',
    {
      schema: {
        tags,
        summary: 'Altera quantidade (+/−) e/ou observação de um item',
        security: bearer,
        params: idParam,
        body: updateCartItemBody,
        response: { ...ok, ...errorResponses(400, 401, 404) },
      },
    },
    async (req) => services.cart.updateItem(req.user.id, req.params.id, req.body),
  );

  app.delete(
    '/cart/items/:id',
    {
      schema: {
        tags,
        summary: 'Remove item do carrinho',
        security: bearer,
        params: idParam,
        response: { ...ok, ...errorResponses(401, 404) },
      },
    },
    async (req) => services.cart.removeItem(req.user.id, req.params.id),
  );

  app.delete(
    '/cart',
    {
      schema: { tags, summary: 'Esvazia o carrinho', security: bearer, response: { ...ok, ...errorResponses(401) } },
    },
    async (req) => services.cart.clear(req.user.id),
  );

  app.put(
    '/cart/coupon',
    {
      schema: {
        tags,
        summary: 'Aplica cupom promocional',
        description: 'Cupom de demonstração: RANGO10 (10% sobre o subtotal). Não diferencia maiúsculas/minúsculas.',
        security: bearer,
        body: couponBody,
        response: { ...ok, ...errorResponses(400, 401, 422) },
      },
    },
    async (req) => services.cart.applyCoupon(req.user.id, req.body.code),
  );

  app.delete(
    '/cart/coupon',
    {
      schema: { tags, summary: 'Remove o cupom', security: bearer, response: { ...ok, ...errorResponses(401) } },
    },
    async (req) => services.cart.removeCoupon(req.user.id),
  );
};
