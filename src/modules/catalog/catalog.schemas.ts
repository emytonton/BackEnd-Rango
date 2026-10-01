import { z } from 'zod';
import { toReais } from '../../lib/money';
import { paginationMeta, paginationQuery } from '../../lib/pagination';
import type { AddonRow, CategoryRow, ProductRow } from './catalog.repository';

export const SECTIONS = {
  offers: 'Ofertas para você',
  popular: 'Mais pedidos',
  recommended: 'Recomendados',
  fast: 'Entrega rápida',
} as const;

export const sectionField = z.enum(['offers', 'popular', 'recommended', 'fast']);

export const categoryDto = z.object({ id: z.number().int(), name: z.string(), slug: z.string() });

export const addonDto = z.object({ id: z.string(), name: z.string(), price: z.number() });

export const productSummaryDto = z.object({
  id: z.string(),
  name: z.string(),
  restaurant: z.string(),
  category: categoryDto.omit({ id: true }),
  description: z.string(),
  price: z.number().describe('Em reais'),
  oldPrice: z.number().nullable().describe('Preço "de" quando o produto está em oferta'),
  rating: z.number(),
  deliveryTime: z.object({ min: z.number().int(), max: z.number().int() }).describe('Minutos'),
  imageUrl: z.string().nullable().describe('null nos dados de demonstração — use imageHue para o placeholder'),
  imageHue: z.number().int().describe('Matiz (0-360) do placeholder colorido usado no protótipo'),
  tags: z.array(sectionField),
  isAvailable: z.boolean(),
  isFavorite: z.boolean(),
});

export const productDetailDto = productSummaryDto.extend({
  ingredients: z.string(),
  addons: z.array(addonDto).describe('Adicionais opcionais (somam ao preço unitário)'),
});

export type ProductSummaryDto = z.infer<typeof productSummaryDto>;

export const productListQuery = z.object({
  q: z.string().trim().max(80).optional().describe('Busca por nome, restaurante ou categoria (ignora acentos)'),
  category: z.string().trim().optional().describe('Slug ou nome da categoria; omita para "Todos"'),
  section: sectionField.optional(),
  maxPrice: z.coerce.number().positive().optional().describe('Preço máximo em reais'),
  minRating: z.coerce.number().min(0).max(5).optional(),
  maxDeliveryTime: z.coerce.number().int().positive().optional().describe('Entrega em até N minutos'),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'rating']).default('relevance'),
  ...paginationQuery,
});

export const productListResponse = z.object({ data: z.array(productSummaryDto), meta: paginationMeta });

export function toCategoryDto(c: CategoryRow) {
  return { id: c.id, name: c.name, slug: c.slug };
}

export function toAddonDto(a: AddonRow) {
  return { id: a.id, name: a.name, price: toReais(a.price_cents) };
}

export function toProductSummary(p: ProductRow): ProductSummaryDto {
  return {
    id: p.id,
    name: p.name,
    restaurant: p.restaurant,
    category: { name: p.category_name, slug: p.category_slug },
    description: p.description,
    price: toReais(p.price_cents),
    oldPrice: p.old_price_cents ? toReais(p.old_price_cents) : null,
    rating: p.rating,
    deliveryTime: { min: p.delivery_min, max: p.delivery_max },
    imageUrl: p.image_url,
    imageHue: p.image_hue,
    tags: (p.tags ? p.tags.split(',') : []) as ProductSummaryDto['tags'],
    isAvailable: !!p.is_available,
    isFavorite: !!p.is_favorite,
  };
}
