import { z } from 'zod';
import { addonDto } from '../catalog/catalog.schemas';

export const addCartItemBody = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
  addonIds: z.array(z.string()).max(10).default([]).describe('Ids dos adicionais escolhidos (ex.: ["a1","a3"])'),
  notes: z.string().trim().max(200).default('').describe('Observações para o pedido'),
});

export const updateCartItemBody = z
  .object({
    quantity: z.number().int().min(1, 'Use DELETE para remover o item.').max(99).optional(),
    notes: z.string().trim().max(200).optional(),
  })
  .refine((b) => b.quantity !== undefined || b.notes !== undefined, 'Informe quantity e/ou notes.');

export const couponBody = z.object({ code: z.string().trim().min(1, 'Informe o cupom.').max(30) });

export const cartItemDto = z.object({
  id: z.number().int().describe('Id da linha do carrinho'),
  product: z.object({
    id: z.string(),
    name: z.string(),
    restaurant: z.string(),
    imageUrl: z.string().nullable(),
    imageHue: z.number().int(),
    isAvailable: z.boolean(),
  }),
  quantity: z.number().int(),
  addons: z.array(addonDto),
  notes: z.string(),
  unitPrice: z.number().describe('Produto + adicionais'),
  total: z.number().describe('unitPrice × quantity'),
});

export const cartSummaryDto = z.object({
  itemCount: z.number().int().describe('Soma das quantidades (badge do carrinho)'),
  subtotal: z.number(),
  deliveryFee: z.number(),
  discount: z.number(),
  total: z.number(),
  freeDeliveryThreshold: z.number().describe('Entrega grátis a partir deste subtotal'),
});

export const cartDto = z.object({
  items: z.array(cartItemDto),
  coupon: z
    .object({
      code: z.string(),
      description: z.string(),
      percentOff: z.number().int(),
      minSubtotal: z.number(),
      applied: z.boolean().describe('false se o cupom deixou de valer (ex.: subtotal abaixo do mínimo)'),
    })
    .nullable(),
  summary: cartSummaryDto,
});

export type CartDto = z.infer<typeof cartDto>;
