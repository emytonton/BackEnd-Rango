import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../container';
import type { AppConfig } from '../../config';
import { errorResponses } from '../../lib/http-schemas';
import {
  authResponse,
  forgotPasswordBody,
  forgotPasswordResponse,
  loginBody,
  messageResponse,
  refreshBody,
  registerBody,
  resetPasswordBody,
} from './auth.schemas';

const FORGOT_MESSAGE = 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.';

export const authRoutes: FastifyPluginAsyncZod<{ services: Services; config: AppConfig }> = async (
  app,
  { services, config },
) => {
  const tags = ['Autenticação'];

  app.post(
    '/auth/register',
    {
      schema: {
        tags,
        summary: 'Cria conta e já inicia a sessão',
        body: registerBody,
        response: { 201: authResponse, ...errorResponses(400, 409) },
      },
    },
    async (req, reply) => reply.status(201).send(await services.auth.register(req.body)),
  );

  app.post(
    '/auth/login',
    {
      schema: {
        tags,
        summary: 'Entrar com e-mail e senha',
        description: 'Credenciais inválidas → 401 INVALID_CREDENTIALS (não revela se o e-mail existe).',
        body: loginBody,
        response: { 200: authResponse, ...errorResponses(400, 401) },
      },
    },
    async (req) => services.auth.login(req.body.email, req.body.password, req.body.keepSignedIn),
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        tags,
        summary: 'Renova o access token (rotaciona o refresh token)',
        description:
          'Chamar quando uma requisição retornar 401 TOKEN_EXPIRED. O refresh token antigo deixa de valer; ' +
          'reutilizá-lo encerra todas as sessões do usuário.',
        body: refreshBody,
        response: { 200: authResponse, ...errorResponses(400, 401) },
      },
    },
    async (req) => services.auth.refresh(req.body.refreshToken),
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags,
        summary: 'Sair da conta (revoga o refresh token)',
        body: refreshBody,
        response: { 204: z.null(), ...errorResponses(400) },
      },
    },
    async (req, reply) => {
      services.auth.logout(req.body.refreshToken);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/auth/forgot-password',
    {
      schema: {
        tags,
        summary: 'Solicita redefinição de senha',
        description:
          'Sempre responde 202 com a mesma mensagem. Não há envio de e-mail neste projeto: o token é registrado ' +
          'no log do servidor e, em desenvolvimento, devolvido em `resetToken`. Validade: 30 minutos.',
        body: forgotPasswordBody,
        response: { 202: forgotPasswordResponse, ...errorResponses(400) },
      },
    },
    async (req, reply) => {
      const { token, user } = services.auth.forgotPassword(req.body.email);
      if (token && user && config.exposeResetToken) {
        req.log.info({ userId: user.id, resetToken: token }, 'password reset requested (dev)');
      }
      return reply
        .status(202)
        .send({ message: FORGOT_MESSAGE, ...(config.exposeResetToken && token ? { resetToken: token } : {}) });
    },
  );

  app.post(
    '/auth/reset-password',
    {
      schema: {
        tags,
        summary: 'Define a nova senha usando o token recebido',
        description: 'Encerra todas as sessões abertas do usuário.',
        body: resetPasswordBody,
        response: { 200: messageResponse, ...errorResponses(400) },
      },
    },
    async (req) => {
      await services.auth.resetPassword(req.body.token, req.body.password);
      return { message: 'Senha redefinida com sucesso. Entre com a nova senha.' };
    },
  );
};
