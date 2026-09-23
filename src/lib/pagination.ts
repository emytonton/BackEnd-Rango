import { z } from 'zod';

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1).describe('Página (começa em 1)'),
  pageSize: z.coerce.number().int().min(1).max(50).default(20).describe('Itens por página (máx. 50)'),
};

export const paginationMeta = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type PaginationMeta = z.infer<typeof paginationMeta>;

export function buildMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
