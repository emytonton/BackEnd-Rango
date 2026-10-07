import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError, type FieldError } from '../lib/errors';

/** Erros do Fastify/plugins que podem ser expostos com mensagem amigável. */
const KNOWN_ERRORS: Record<string, { code: string; message: string }> = {
  FST_ERR_CTP_INVALID_JSON_BODY: { code: 'INVALID_JSON', message: 'JSON inválido.' },
  FST_ERR_CTP_EMPTY_JSON_BODY: { code: 'INVALID_JSON', message: 'Corpo da requisição vazio.' },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type não suportado.' },
  FST_ERR_CTP_BODY_TOO_LARGE: { code: 'PAYLOAD_TOO_LARGE', message: 'Requisição muito grande.' },
  FST_REQ_FILE_TOO_LARGE: { code: 'FILE_TOO_LARGE', message: 'Imagem muito grande (máximo 5 MB).' },
  FST_INVALID_MULTIPART_CONTENT_TYPE: { code: 'MULTIPART_REQUIRED', message: 'Envie a imagem como multipart/form-data.' },
  FST_FILES_LIMIT: { code: 'TOO_MANY_FILES', message: 'Envie apenas uma imagem.' },
};

function toField(path: string, context?: string): string {
  const field = path.replace(/^\//, '').replace(/\//g, '.');
  return field || context || 'body';
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
      });
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      const details: FieldError[] = err.validation.map((v) => ({
        field: toField(v.instancePath, err.validationContext),
        message: v.message ?? 'Valor inválido.',
      }));
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: details[0]?.message ?? 'Dados inválidos.', details },
      });
    }

    if (isResponseSerializationError(err)) {
      req.log.error({ err, issues: err.cause.issues }, 'response does not match schema');
      return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
    }

    const known = err.code ? KNOWN_ERRORS[err.code] : undefined;
    if (known) return reply.status(err.statusCode ?? 400).send({ error: known });

    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'BAD_REQUEST', message: err.message } });
    }

    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente.' } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'ROUTE_NOT_FOUND', message: `Rota ${req.method} ${req.url} não existe.` } }),
  );
}
