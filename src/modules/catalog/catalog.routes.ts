import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Services } from '../../container';
import { bearer, errorResponses } from '../../lib/http-schemas';
import {
  categoryDto,
  productDetailDto,
  productListQuery,
  productListResponse,
  productSummaryDto,
} from './catalog.schemas';

const productIdParam = z.object({ productId: z.string().min(1).max(40) });
const recentList = z.object({ data: z.array(z.string()) });

export const catalogRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.get(
    '/categories',
    {
      schema: {
        tags: ['Catálogo'],
        summary: 'Lista categorias',
        description: '"Todos" não é uma categoria: o frontend exibe o chip e simplesmente omite o filtro `category`.',
        security: bearer,
        response: { 200: z.object({ data: z.array(categoryDto) }), ...errorResponses(401) },
      },
    },
    async () => ({ data: services.catalog.categories() }),
  );

  app.get(
    '/products',
    {
      schema: {
        tags: ['Catálogo'],
        summary: 'Lista/busca produtos com filtros, ordenação e paginação',
        description:
          'Atende Home (por categoria/seção), Busca e Filtros. Mapeamento do protótipo: ' +
          'ordenação rel→relevance, asc→price_asc, desc→price_desc, rating→rating; ' +
          'faixa de preço→maxPrice; avaliação→minRating; tempo de entrega→maxDeliveryTime. ' +
          'Lista vazia (`data: []`, `meta.total: 0`) = estado "Nenhum produto encontrado."',
        security: bearer,
        querystring: productListQuery,
        response: { 200: productListResponse, ...errorResponses(400, 401) },
      },
    },
    async (req) => services.catalog.listProducts(req.user.id, req.query),
  );

  app.get(
    '/products/:productId',
    {
      schema: {
        tags: ['Catálogo'],
        summary: 'Detalhes do produto (ingredientes e adicionais)',
        security: bearer,
        params: productIdParam,
        response: { 200: productDetailDto, ...errorResponses(401, 404) },
      },
    },
    async (req) => services.catalog.getProduct(req.user.id, req.params.productId),
  );

  // ---------- busca ----------
  app.get(
    '/search/suggestions',
    {
      schema: {
        tags: ['Busca'],
        summary: 'Sugestões de busca',
        description: 'Sem `q`: produtos mais pedidos. Com `q`: produtos, categorias e restaurantes que contêm o termo.',
        security: bearer,
        querystring: z.object({ q: z.string().trim().max(80).optional() }),
        response: { 200: recentList, ...errorResponses(401) },
      },
    },
    async (req) => ({ data: services.catalog.suggestions(req.user.id, req.query.q) }),
  );

  app.get(
    '/search/recent',
    {
      schema: {
        tags: ['Busca'],
        summary: 'Pesquisas recentes (até 6, mais recente primeiro)',
        security: bearer,
        response: { 200: recentList, ...errorResponses(401) },
      },
    },
    async (req) => ({ data: services.catalog.recentSearches(req.user.id) }),
  );

  app.post(
    '/search/recent',
    {
      schema: {
        tags: ['Busca'],
        summary: 'Registra uma pesquisa recente',
        description: 'Chamar quando o usuário confirma a busca ou abre um produto a partir dos resultados.',
        security: bearer,
        body: z.object({ term: z.string().trim().min(1).max(80) }),
        response: { 200: recentList, ...errorResponses(400, 401) },
      },
    },
    async (req) => ({ data: services.catalog.saveRecentSearch(req.user.id, req.body.term) }),
  );

  app.delete(
    '/search/recent',
    {
      schema: {
        tags: ['Busca'],
        summary: 'Limpa as pesquisas recentes',
        security: bearer,
        response: { 204: z.null(), ...errorResponses(401) },
      },
    },
    async (req, reply) => {
      services.catalog.clearRecentSearches(req.user.id);
      return reply.status(204).send(null);
    },
  );

  // ---------- favoritos ----------
  const favoriteState = z.object({ productId: z.string(), isFavorite: z.boolean() });

  app.get(
    '/favorites',
    {
      schema: {
        tags: ['Favoritos'],
        summary: 'Lista produtos favoritos (mais recentes primeiro)',
        security: bearer,
        response: { 200: z.object({ data: z.array(productSummaryDto) }), ...errorResponses(401) },
      },
    },
    async (req) => ({ data: services.catalog.favorites(req.user.id) }),
  );

  app.put(
    '/favorites/:productId',
    {
      schema: {
        tags: ['Favoritos'],
        summary: 'Adiciona aos favoritos (idempotente)',
        security: bearer,
        params: productIdParam,
        response: { 200: favoriteState, ...errorResponses(401, 404) },
      },
    },
    async (req) => services.catalog.setFavorite(req.user.id, req.params.productId, true),
  );

  app.delete(
    '/favorites/:productId',
    {
      schema: {
        tags: ['Favoritos'],
        summary: 'Remove dos favoritos (idempotente)',
        security: bearer,
        params: productIdParam,
        response: { 200: favoriteState, ...errorResponses(401, 404) },
      },
    },
    async (req) => services.catalog.setFavorite(req.user.id, req.params.productId, false),
  );
};
