import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../container';
import { bearer, errorResponses, idParam } from '../../lib/http-schemas';
import { addressDto, createAddressBody, updateAddressBody } from './address.schemas';

export const addressRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const tags = ['Endereços'];

  app.get(
    '/addresses',
    {
      schema: {
        tags,
        summary: 'Lista endereços salvos (selecionado primeiro)',
        security: bearer,
        response: { 200: z.object({ data: z.array(addressDto) }), ...errorResponses(401) },
      },
    },
    async (req) => ({ data: services.addresses.list(req.user.id) }),
  );

  app.post(
    '/addresses',
    {
      schema: {
        tags,
        summary: 'Cadastra novo endereço',
        security: bearer,
        body: createAddressBody,
        response: { 201: addressDto, ...errorResponses(400, 401) },
      },
    },
    async (req, reply) =>
      reply.status(201).send(
        services.addresses.create(req.user.id, { ...req.body, complement: req.body.complement || null }),
      ),
  );

  app.patch(
    '/addresses/:id',
    {
      schema: {
        tags,
        summary: 'Edita endereço',
        security: bearer,
        params: idParam,
        body: updateAddressBody,
        response: { 200: addressDto, ...errorResponses(400, 401, 404) },
      },
    },
    async (req) => {
      const { complement, ...rest } = req.body;
      return services.addresses.update(req.user.id, req.params.id, {
        ...rest,
        ...(complement !== undefined ? { complement: complement || null } : {}),
      });
    },
  );

  app.post(
    '/addresses/:id/select',
    {
      schema: {
        tags,
        summary: 'Define o endereço de entrega atual ("Usar este endereço")',
        security: bearer,
        params: idParam,
        response: { 200: addressDto, ...errorResponses(401, 404) },
      },
    },
    async (req) => services.addresses.select(req.user.id, req.params.id),
  );

  app.delete(
    '/addresses/:id',
    {
      schema: {
        tags,
        summary: 'Remove endereço',
        description: 'Pedidos antigos mantêm uma cópia do endereço, então o histórico não é afetado.',
        security: bearer,
        params: idParam,
        response: { 204: z.null(), ...errorResponses(401, 404) },
      },
    },
    async (req, reply) => {
      services.addresses.remove(req.user.id, req.params.id);
      return reply.status(204).send(null);
    },
  );
};
