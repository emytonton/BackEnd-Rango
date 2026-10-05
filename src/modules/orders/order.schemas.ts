import { z } from 'zod';
import { toReais } from '../../lib/money';
import { paginationMeta, paginationQuery } from '../../lib/pagination';
import { addonDto } from '../catalog/catalog.schemas';
import { cartDto } from '../cart/cart.schemas';
import { paymentTypeField } from '../payment-methods/payment-method.schemas';
import { MAX_CANCELLABLE_STEP, ORDER_STEPS, STEP_HINTS, formatOrderCode, statusLabel } from './order-status';
import type { OrderEventRow, OrderItemRow, OrderRow } from './order.repository';

export const createOrderBody = z.object({
  addressId: z.number().int().positive().optional().describe('Omitido: usa o endereço selecionado'),
  paymentMethodId: z.number().int().positive(),
  changeFor: z.number().positive().optional().describe('Troco para (R$) — apenas pagamento em dinheiro'),
});

export const listOrdersQuery = z.object({
  group: z.enum(['live', 'past']).optional().describe('live = "Em andamento"; past = "Anteriores" (entregues e cancelados)'),
  ...paginationQuery,
});

export const orderCodeParam = z.object({
  id: z.string().regex(/^(RG-)?\d+$/i, 'Pedido inválido.').describe('Aceita "RG-10482" ou "10482"'),
});

const statusField = z.enum(['live', 'done', 'cancel']);

export const orderSummaryDto = z.object({
  id: z.number().int(),
  code: z.string().describe('Número exibido: RG-10482'),
  status: statusField,
  statusLabel: z.string(),
  step: z.number().int(),
  createdAt: z.string(),
  total: z.number(),
  itemCount: z.number().int(),
  itemsSummary: z.string().describe('"1× Burger duplo cheddar, 2× Limonada suíça"'),
  thumbnail: z.object({ productId: z.string().nullable(), imageHue: z.number().int() }),
});

export const orderDetailDto = orderSummaryDto.extend({
  updatedAt: z.string(),
  hint: z.string().describe('Texto de apoio da etapa atual'),
  canCancel: z.boolean(),
  timeline: z.array(
    z.object({
      step: z.number().int(),
      label: z.string(),
      state: z.enum(['done', 'current', 'upcoming']),
      reachedAt: z.string().nullable(),
    }),
  ),
  estimatedDelivery: z.object({
    minMinutes: z.number().int(),
    maxMinutes: z.number().int(),
    latestAt: z.string().describe('createdAt + maxMinutes'),
  }),
  items: z.array(
    z.object({
      productId: z.string().nullable(),
      name: z.string(),
      imageHue: z.number().int(),
      quantity: z.number().int(),
      unitPrice: z.number(),
      total: z.number(),
      addons: z.array(addonDto),
      notes: z.string(),
    }),
  ),
  address: z.object({ id: z.number().int().nullable(), label: z.string(), line: z.string(), cityLine: z.string() }),
  payment: z.object({ type: paymentTypeField, label: z.string(), detail: z.string(), changeFor: z.number().nullable() }),
  amounts: z.object({
    subtotal: z.number(),
    deliveryFee: z.number(),
    discount: z.number(),
    total: z.number(),
    couponCode: z.string().nullable(),
  }),
  courier: z.object({ name: z.string(), vehicle: z.string() }),
});

export const orderListResponse = z.object({ data: z.array(orderSummaryDto), meta: paginationMeta });

export const reorderResponse = z.object({
  cart: cartDto,
  skippedProductIds: z.array(z.string()).describe('Produtos do pedido que não estão mais disponíveis'),
});

export type OrderSummaryDto = z.infer<typeof orderSummaryDto>;
export type OrderDetailDto = z.infer<typeof orderDetailDto>;

export function toOrderSummary(o: OrderRow, items: OrderItemRow[]): OrderSummaryDto {
  const first = items[0];
  return {
    id: o.id,
    code: formatOrderCode(o.id),
    status: o.status,
    statusLabel: statusLabel(o.status, o.step),
    step: o.step,
    createdAt: o.created_at,
    total: toReais(o.total_cents),
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    itemsSummary: items.map((i) => `${i.quantity}× ${i.product_name}`).join(', '),
    thumbnail: { productId: first?.product_id ?? null, imageHue: first?.image_hue ?? 30 },
  };
}

function timelineState(o: OrderRow, step: number): 'done' | 'current' | 'upcoming' {
  if (step < o.step || (step === o.step && o.status !== 'live')) return 'done';
  if (step === o.step) return 'current';
  return 'upcoming';
}

export function toOrderDetail(o: OrderRow, items: OrderItemRow[], events: OrderEventRow[]): OrderDetailDto {
  const reached = new Map(events.map((e) => [e.step, e.created_at]));
  const latest = new Date(new Date(o.created_at).getTime() + o.eta_max * 60_000).toISOString();
  return {
    ...toOrderSummary(o, items),
    updatedAt: o.updated_at,
    hint: o.status === 'cancel' ? 'Este pedido foi cancelado' : STEP_HINTS[o.step],
    canCancel: o.status === 'live' && o.step <= MAX_CANCELLABLE_STEP,
    timeline: ORDER_STEPS.map((label, step) => ({
      step,
      label,
      state: timelineState(o, step),
      reachedAt: reached.get(step) ?? null,
    })),
    estimatedDelivery: { minMinutes: o.eta_min, maxMinutes: o.eta_max, latestAt: latest },
    items: items.map((i) => {
      const addons = JSON.parse(i.addons_json) as { id: string; name: string; price_cents: number }[];
      return {
        productId: i.product_id,
        name: i.product_name,
        imageHue: i.image_hue,
        quantity: i.quantity,
        unitPrice: toReais(i.unit_price_cents),
        total: toReais(i.unit_price_cents * i.quantity),
        addons: addons.map((a) => ({ id: a.id, name: a.name, price: toReais(a.price_cents) })),
        notes: i.notes,
      };
    }),
    address: { id: o.address_id, label: o.address_label, line: o.address_line, cityLine: o.address_city },
    payment: {
      type: o.payment_type,
      label: o.payment_label,
      detail: o.payment_detail,
      changeFor: o.change_for_cents !== null ? toReais(o.change_for_cents) : null,
    },
    amounts: {
      subtotal: toReais(o.subtotal_cents),
      deliveryFee: toReais(o.delivery_fee_cents),
      discount: toReais(o.discount_cents),
      total: toReais(o.total_cents),
      couponCode: o.coupon_code,
    },
    courier: { name: o.courier_name, vehicle: o.courier_vehicle },
  };
}
