import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../container';
import { badRequest } from '../../lib/errors';
import { bearer, errorResponses } from '../../lib/http-schemas';
import { AVATAR_MAX_BYTES } from './profile.service';
import { emailField, nameField, phoneField, settingsDto, themeField, userDto } from './user.schemas';

const updateProfileBody = z
  .object({ name: nameField, email: emailField, phone: phoneField })
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'Informe ao menos um campo.');

const updateSettingsBody = z
  .object({
    theme: themeField,
    notifications: z.object({ orders: z.boolean(), promos: z.boolean(), news: z.boolean() }).partial(),
  })
  .partial();

export const profileRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  const tags = ['Perfil'];

  app.get(
    '/me',
    {
      schema: {
        tags,
        summary: 'Dados do usuário logado',
        security: bearer,
        response: { 200: userDto, ...errorResponses(401) },
      },
    },
    async (req) => services.profile.get(req.user.id),
  );

  app.patch(
    '/me',
    {
      schema: {
        tags,
        summary: 'Edita perfil (nome, e-mail, telefone)',
        security: bearer,
        body: updateProfileBody,
        response: { 200: userDto, ...errorResponses(400, 401, 409) },
      },
    },
    async (req) => services.profile.update(req.user.id, req.body),
  );

  app.put(
    '/me/avatar',
    {
      schema: {
        tags,
        summary: 'Envia/troca a foto de perfil',
        description:
          'multipart/form-data com o campo `file` (JPG, PNG ou WEBP, até 5 MB). O recorte e o zoom são feitos ' +
          'no app; envie a imagem já recortada. O tipo é validado pelo conteúdo do arquivo.',
        consumes: ['multipart/form-data'],
        security: bearer,
        response: { 200: userDto, ...errorResponses(400, 401, 406, 413, 415) },
      },
    },
    async (req) => {
      const file = await req.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });
      if (!file) throw badRequest('FILE_REQUIRED', 'Envie a imagem no campo "file".');
      const data = await file.toBuffer();
      return services.profile.setAvatar(req.user.id, data);
    },
  );

  app.delete(
    '/me/avatar',
    {
      schema: {
        tags,
        summary: 'Remove a foto de perfil',
        security: bearer,
        response: { 200: userDto, ...errorResponses(401) },
      },
    },
    async (req) => services.profile.removeAvatar(req.user.id),
  );

  app.get(
    '/me/settings',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Preferências (tema e notificações)',
        security: bearer,
        response: { 200: settingsDto, ...errorResponses(401) },
      },
    },
    async (req) => services.profile.settings(req.user.id),
  );

  app.patch(
    '/me/settings',
    {
      schema: {
        tags: ['Configurações'],
        summary: 'Atualiza preferências (parcial)',
        description:
          'theme: light | dark | system. As flags de notificação controlam quais notificações são geradas ' +
          '(orders = pedidos, promos = promoções, news = novidades).',
        security: bearer,
        body: updateSettingsBody,
        response: { 200: settingsDto, ...errorResponses(400, 401) },
      },
    },
    async (req) => {
      const { theme, notifications: n } = req.body;
      return services.profile.updateSettings(req.user.id, {
        theme,
        notifyOrders: n?.orders,
        notifyPromos: n?.promos,
        notifyNews: n?.news,
      });
    },
  );
};
