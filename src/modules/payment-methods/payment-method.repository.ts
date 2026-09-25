import type { DB } from '../../db/connection';

export type PaymentType = 'pix' | 'credit' | 'debit' | 'cash';

export interface PaymentMethodRow {
  id: number;
  user_id: number;
  type: PaymentType;
  brand: string | null;
  last4: string | null;
  created_at: string;
}

export interface NewPaymentMethod {
  type: PaymentType;
  brand?: string | null;
  last4?: string | null;
}

export class PaymentMethodRepository {
  constructor(private readonly db: DB) {}

  listByUser(userId: number): PaymentMethodRow[] {
    return this.db
      .prepare(
        `SELECT * FROM payment_methods WHERE user_id = ?
         ORDER BY CASE type WHEN 'pix' THEN 0 WHEN 'credit' THEN 1 WHEN 'debit' THEN 2 ELSE 3 END, id`,
      )
      .all(userId) as PaymentMethodRow[];
  }

  findById(userId: number, id: number): PaymentMethodRow | undefined {
    return this.db.prepare('SELECT * FROM payment_methods WHERE id = ? AND user_id = ?').get(id, userId) as
      | PaymentMethodRow
      | undefined;
  }

  existsOfType(userId: number, type: PaymentType): boolean {
    return !!this.db.prepare('SELECT 1 FROM payment_methods WHERE user_id = ? AND type = ?').get(userId, type);
  }

  create(userId: number, m: NewPaymentMethod, now: string): PaymentMethodRow {
    const info = this.db
      .prepare('INSERT INTO payment_methods (user_id, type, brand, last4, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, m.type, m.brand ?? null, m.last4 ?? null, now);
    return this.findById(userId, Number(info.lastInsertRowid))!;
  }

  delete(userId: number, id: number): boolean {
    return this.db.prepare('DELETE FROM payment_methods WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  }
}
