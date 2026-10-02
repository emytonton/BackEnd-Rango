import type { DB } from '../../db/connection';

export interface CartItemRow {
  id: number;
  user_id: number;
  product_id: string;
  addon_key: string;
  quantity: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CouponRow {
  code: string;
  description: string;
  percent_off: number;
  min_subtotal_cents: number;
  active: 0 | 1;
  expires_at: string | null;
}

export interface NewCartItem {
  productId: string;
  addonKey: string;
  quantity: number;
  notes: string;
}

export class CartRepository {
  constructor(private readonly db: DB) {}

  couponCode(userId: number): string | null {
    const row = this.db.prepare('SELECT coupon_code FROM carts WHERE user_id = ?').get(userId) as
      | { coupon_code: string | null }
      | undefined;
    return row?.coupon_code ?? null;
  }

  setCoupon(userId: number, code: string | null, now: string): void {
    this.db
      .prepare(
        `INSERT INTO carts (user_id, coupon_code, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET coupon_code = excluded.coupon_code, updated_at = excluded.updated_at`,
      )
      .run(userId, code, now);
  }

  findCoupon(code: string): CouponRow | undefined {
    return this.db.prepare('SELECT * FROM coupons WHERE code = ?').get(code) as CouponRow | undefined;
  }

  listItems(userId: number): CartItemRow[] {
    return this.db.prepare('SELECT * FROM cart_items WHERE user_id = ? ORDER BY id').all(userId) as CartItemRow[];
  }

  findItem(userId: number, id: number): CartItemRow | undefined {
    return this.db.prepare('SELECT * FROM cart_items WHERE id = ? AND user_id = ?').get(id, userId) as
      | CartItemRow
      | undefined;
  }

  findByKey(userId: number, productId: string, addonKey: string): CartItemRow | undefined {
    return this.db
      .prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ? AND addon_key = ?')
      .get(userId, productId, addonKey) as CartItemRow | undefined;
  }

  insertItem(userId: number, item: NewCartItem, now: string): void {
    this.db
      .prepare(
        `INSERT INTO cart_items (user_id, product_id, addon_key, quantity, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, item.productId, item.addonKey, item.quantity, item.notes, now, now);
  }

  updateItem(userId: number, id: number, fields: { quantity?: number; notes?: string }, now: string): void {
    this.db
      .prepare(
        `UPDATE cart_items SET quantity = COALESCE(?, quantity), notes = COALESCE(?, notes), updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .run(fields.quantity ?? null, fields.notes ?? null, now, id, userId);
  }

  deleteItem(userId: number, id: number): boolean {
    return this.db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  }

  /** Esvazia o carrinho e remove o cupom. */
  clear(userId: number, now: string): void {
    this.db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
    this.setCoupon(userId, null, now);
  }
}
