import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../lib/errors';
import type { UserRepository } from '../modules/users/user.repository';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { id: number };
  }
}

/**
 * Hook `onRequest` das rotas protegidas: valida o Bearer token e se o usuário ainda existe.
 * Códigos: UNAUTHORIZED (sem token), TOKEN_EXPIRED (renovar via /auth/refresh), INVALID_TOKEN.
 */
export function createAuthenticate(users: UserRepository) {
  return async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    try {
      await req.jwtVerify();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
        throw unauthorized('Sessão expirada. Renove o token.', 'TOKEN_EXPIRED');
      }
      if (code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') throw unauthorized();
      throw unauthorized('Token inválido.', 'INVALID_TOKEN');
    }
    if (!users.findById(req.user.id)) throw unauthorized('Token inválido.', 'INVALID_TOKEN');
  };
}
