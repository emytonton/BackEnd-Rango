import type { AppConfig } from '../../config';
import type { DB } from '../../db/connection';
import type { Clock } from '../../lib/clock';
import { notFound, unprocessable } from '../../lib/errors';
import { formatBRL, toCents } from '../../lib/money';
import { buildMeta } from '../../lib/pagination';
import type { AddressRepository } from '../addresses/address.repository';
import { formatAddressLine, formatCityLine } from '../addresses/address.schemas';
import type { CartService } from '../cart/cart.service';
import type { NotificationService } from '../notifications/notification.service';
import type { PaymentMethodRepository } from '../payment-methods/payment-method.repository';
import { PAYMENT_LABELS, paymentDetail } from '../payment-methods/payment-method.schemas';
import {
  COURIERS,
  LAST_STEP,
  MAX_CANCELLABLE_STEP,
  formatOrderCode,
  parseOrderCode,
  pendingAdvances,
} from './order-status';
import type { OrderGroup, OrderRepository, OrderRow } from './order.repository';
import { toOrderDetail, toOrderSummary } from './order.schemas';

export interface CreateOrderInput {
  addressId?: number;
  paymentMethodId: number;
  changeFor?: number;
}

export class OrderService {
  constructor(
    private readonly db: DB,
    private readonly orders: OrderRepository,
    private readonly cart: CartService,
    private readonly addresses: AddressRepository,
    private readonly paymentMethods: PaymentMethodRepository,
    private readonly notifications: NotificationService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  /** Checkout: transforma o carrinho em pedido, limpa o carrinho e notifica. */
  create(userId: number, input: CreateOrderInput) {
    const priced = this.cart.price(userId);
    if (!priced.lines.length) throw unprocessable('EMPTY_CART', 'Seu carrinho está vazio.');
    const unavailable = priced.lines.filter((l) => !l.product.is_available);
    if (unavailable.length) {
      throw unprocessable(
        'PRODUCT_UNAVAILABLE',
        `Indisponível no momento: ${unavailable.map((l) => l.product.name).join(', ')}. Remova do carrinho para continuar.`,
      );
    }

    const address = input.addressId
      ? this.addresses.findById(userId, input.addressId)
      : this.addresses.findSelected(userId);
    if (!address) {
      throw input.addressId
        ? notFound('Endereço não encontrado.')
        : unprocessable('ADDRESS_REQUIRED', 'Cadastre ou selecione um endereço de entrega.');
    }

    const payment = this.paymentMethods.findById(userId, input.paymentMethodId);
    if (!payment) throw notFound('Forma de pagamento não encontrada.');

    const { totals } = priced;
    let changeForCents: number | null = null;
    if (input.changeFor !== undefined) {
      if (payment.type !== 'cash') {
        throw unprocessable('INVALID_CHANGE', 'Troco só se aplica a pagamento em dinheiro.');
      }
      changeForCents = toCents(input.changeFor);
      if (changeForCents < totals.totalCents) {
        throw unprocessable('INVALID_CHANGE', `O troco deve ser para um valor de pelo menos ${formatBRL(totals.totalCents)}.`);
      }
    }

    const now = this.clock.now().toISOString();
    const courier = COURIERS[this.orders.countByUser(userId) % COURIERS.length];

    const orderId = this.db.transaction(() => {
      const id = this.orders.insert(
        {
          user_id: userId,
          status: 'live',
          step: 1,
          subtotal_cents: totals.subtotalCents,
          delivery_fee_cents: totals.deliveryFeeCents,
          discount_cents: totals.discountCents,
          total_cents: totals.totalCents,
          coupon_code: priced.couponApplied ? priced.coupon!.code : null,
          address_id: address.id,
          address_label: address.label,
          address_line: formatAddressLine(address),
          address_city: formatCityLine(address),
          payment_type: payment.type,
          payment_label: PAYMENT_LABELS[payment.type],
          payment_detail: paymentDetail(payment),
          change_for_cents: changeForCents,
          eta_min: Math.max(...priced.lines.map((l) => l.product.delivery_min)),
          eta_max: Math.max(...priced.lines.map((l) => l.product.delivery_max)),
          courier_name: courier.name,
          courier_vehicle: courier.vehicle,
          created_at: now,
        },
        priced.lines.map((l) => ({
          product_id: l.product.id,
          product_name: l.product.name,
          image_hue: l.product.image_hue,
          quantity: l.row.quantity,
          unit_price_cents: l.unitPriceCents,
          addons_json: JSON.stringify(l.addons),
          notes: l.row.notes,
        })),
      );
      // recebido e confirmado no mesmo instante (pagamento aprovado — não há gateway real)
      this.orders.addEvent(id, 0, now);
      this.orders.addEvent(id, 1, now);
      this.cart.clear(userId);
      this.notifications.notify({
        userId,
        kind: 'order',
        title: 'Seu pedido foi confirmado',
        body: `Pedido ${formatOrderCode(id)} · ${payment.type === 'cash' ? 'pagamento na entrega' : `pagamento aprovado via ${PAYMENT_LABELS[payment.type]}`}.`,
        orderId: id,
        createdAt: now,
      });
      return id;
    })();

    return this.get(userId, String(orderId));
  }

  list(userId: number, group: OrderGroup | undefined, page: number, pageSize: number) {
    this.syncUserOrders(userId);
    const total = this.orders.count(userId, group);
    const rows = this.orders.list(userId, group, pageSize, (page - 1) * pageSize);
    const items = this.orders.items(rows.map((r) => r.id));
    return {
      data: rows.map((o) => toOrderSummary(o, items.filter((i) => i.order_id === o.id))),
      meta: buildMeta(page, pageSize, total),
    };
  }

  get(userId: number, idOrCode: string) {
    const order = this.sync(this.find(userId, idOrCode));
    return toOrderDetail(order, this.orders.items([order.id]), this.orders.events(order.id));
  }

  cancel(userId: number, idOrCode: string) {
    const order = this.sync(this.find(userId, idOrCode));
    if (order.status !== 'live' || order.step > MAX_CANCELLABLE_STEP) {
      throw unprocessable('ORDER_NOT_CANCELLABLE', 'Este pedido não pode mais ser cancelado.');
    }
    this.orders.updateStatus(order.id, 'cancel', order.step, this.clock.now().toISOString());
    return this.get(userId, String(order.id));
  }

  /** "Pedir novamente": substitui o carrinho pelos itens do pedido, com preços atuais. */
  reorder(userId: number, idOrCode: string) {
    const order = this.find(userId, idOrCode);
    const items = this.orders.items([order.id]).map((i) => ({
      productId: i.product_id,
      quantity: i.quantity,
      addonIds: (JSON.parse(i.addons_json) as { id: string }[]).map((a) => a.id),
      notes: i.notes,
    }));
    return this.cart.replaceWith(userId, items);
  }

  /** Avança a simulação de todos os pedidos em andamento do usuário. */
  syncUserOrders(userId: number): void {
    for (const order of this.orders.liveOrders(userId)) this.sync(order);
  }

  private find(userId: number, idOrCode: string): OrderRow {
    const id = parseOrderCode(idOrCode);
    const order = id !== null ? this.orders.findById(userId, id) : undefined;
    if (!order) throw notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
    return order;
  }

  private sync(order: OrderRow): OrderRow {
    if (order.status !== 'live') return order;
    const lastAt = this.orders.lastEventAt(order.id) ?? order.created_at;
    const advances = pendingAdvances(order.step, new Date(lastAt), this.clock.now(), this.config.orderStepSeconds);
    if (!advances.length) return order;

    const code = formatOrderCode(order.id);
    this.db.transaction(() => {
      for (const { step, at } of advances) {
        const iso = at.toISOString();
        this.orders.addEvent(order.id, step, iso);
        this.orders.updateStatus(order.id, step === LAST_STEP ? 'done' : 'live', step, iso);
        if (step === 3) {
          this.notifications.notify({
            userId: order.user_id,
            kind: 'order',
            title: 'Seu pedido saiu para entrega',
            body: `Pedido ${code} · ${order.courier_name} está a caminho.`,
            orderId: order.id,
            createdAt: iso,
          });
        } else if (step === LAST_STEP) {
          this.notifications.notify({
            userId: order.user_id,
            kind: 'order',
            title: 'Seu pedido chegou!',
            body: `Pedido ${code} entregue. Bom apetite!`,
            orderId: order.id,
            createdAt: iso,
          });
        }
      }
    })();
    return this.orders.findById(order.user_id, order.id)!;
  }
}
