import type { DB } from '../../db/connection';
import type { PaymentType } from '../payment-methods/payment-method.repository';
import type { OrderStatus } from './order-status';

export type OrderGroup = 'live' | 'past';

export interface OrderRow {
  id: number;
  user_id: number;
  status: OrderStatus;
  step: number;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  coupon_code: string | null;
  address_id: number | null;
  address_label: string;
  address_line: string;
  address_city: string;
  payment_type: PaymentType;
  payment_label: string;
  payment_detail: string;
  change_for_cents: number | null;
  eta_min: number;
  eta_max: number;
  courier_name: string;
  courier_vehicle: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  product_id: string | null;
  product_name: string;
  image_hue: number;
  quantity: number;
  unit_price_cents: number;
  addons_json: string;
  notes: string;
}

export interface OrderEventRow {
  order_id: number;
  step: number;
  created_at: string;
}

export type NewOrder = Omit<OrderRow, 'id' | 'updated_at'> & { id?: number };
export type NewOrderItem = Omit<OrderItemRow, 'id' | 'order_id'>;

const GROUP_SQL: Record<OrderGroup, string> = {
  live: "status = 'live'",
  past: "status IN ('done', 'cancel')",
};

export class OrderRepository {
  constructor(private readonly db: DB) {}

  insert(o: NewOrder, items: NewOrderItem[]): number {
    const info = this.db
      .prepare(
        `INSERT INTO orders (id, user_id, status, step, subtotal_cents, delivery_fee_cents, discount_cents, total_cents,
           coupon_code, address_id, address_label, address_line, address_city, payment_type, payment_label,
           payment_detail, change_for_cents, eta_min, eta_max, courier_name, courier_vehicle, created_at, updated_at)
         VALUES (@id, @user_id, @status, @step, @subtotal_cents, @delivery_fee_cents, @discount_cents, @total_cents,
           @coupon_code, @address_id, @address_label, @address_line, @address_city, @payment_type, @payment_label,
           @payment_detail, @change_for_cents, @eta_min, @eta_max, @courier_name, @courier_vehicle, @created_at, @created_at)`,
      )
      .run({ id: null, ...o });
    const orderId = Number(info.lastInsertRowid);
    const insertItem = this.db.prepare(
      `INSERT INTO order_items (order_id, product_id, product_name, image_hue, quantity, unit_price_cents, addons_json, notes)
       VALUES (@order_id, @product_id, @product_name, @image_hue, @quantity, @unit_price_cents, @addons_json, @notes)`,
    );
    for (const item of items) insertItem.run({ ...item, order_id: orderId });
    return orderId;
  }

  addEvent(orderId: number, step: number, at: string): void {
    this.db.prepare('INSERT OR IGNORE INTO order_events (order_id, step, created_at) VALUES (?, ?, ?)').run(orderId, step, at);
  }

  findById(userId: number, id: number): OrderRow | undefined {
    return this.db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, userId) as OrderRow | undefined;
  }

  list(userId: number, group: OrderGroup | undefined, limit: number, offset: number): OrderRow[] {
    return this.db
      .prepare(
        `SELECT * FROM orders WHERE user_id = ? ${group ? `AND ${GROUP_SQL[group]}` : ''}
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(userId, limit, offset) as OrderRow[];
  }

  count(userId: number, group?: OrderGroup): number {
    return (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM orders WHERE user_id = ? ${group ? `AND ${GROUP_SQL[group]}` : ''}`)
        .get(userId) as { n: number }
    ).n;
  }

  countByUser(userId: number): number {
    return this.count(userId);
  }

  liveOrders(userId: number): OrderRow[] {
    return this.db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'live'").all(userId) as OrderRow[];
  }

  items(orderIds: number[]): OrderItemRow[] {
    if (!orderIds.length) return [];
    return this.db
      .prepare(`SELECT * FROM order_items WHERE order_id IN (${orderIds.map(() => '?').join(', ')}) ORDER BY id`)
      .all(...orderIds) as OrderItemRow[];
  }

  events(orderId: number): OrderEventRow[] {
    return this.db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY step').all(orderId) as OrderEventRow[];
  }

  lastEventAt(orderId: number): string | undefined {
    const row = this.db.prepare('SELECT MAX(created_at) AS at FROM order_events WHERE order_id = ?').get(orderId) as {
      at: string | null;
    };
    return row.at ?? undefined;
  }

  updateStatus(id: number, status: OrderStatus, step: number, now: string): void {
    this.db.prepare('UPDATE orders SET status = ?, step = ?, updated_at = ? WHERE id = ?').run(status, step, now, id);
  }
}
