import { z } from 'zod';

export const errorResponse = z
  .object({
    error: z.object({
      code: z.string().describe('Código estável para o frontend (ex.: VALIDATION_ERROR, EMPTY_CART)'),
      message: z.string().describe('Mensagem em português pronta para exibir ao usuário'),
      details: z
        .array(z.object({ field: z.string(), message: z.string() }))
        .optional()
        .describe('Erros por campo (validação de formulário)'),
    }),
  })
  .describe('Formato padrão de erro');

/** Gera o mapa de respostas de erro documentadas para uma rota. */
export function errorResponses<const S extends number>(...statuses: S[]): Record<S, typeof errorResponse> {
  return Object.fromEntries(statuses.map((s) => [s, errorResponse])) as Record<S, typeof errorResponse>;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const bearer = [{ bearerAuth: [] }];
