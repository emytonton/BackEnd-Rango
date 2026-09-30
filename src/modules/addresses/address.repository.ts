import type { DB } from '../../db/connection';

export interface AddressRow {
  id: number;
  user_id: number;
  label: string;
  cep: string;
  street: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  is_selected: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface AddressFields {
  label: string;
  cep: string;
  street: string;
  complement: string | null;
  neighborhood: string;
  city: string;
}

export class AddressRepository {
  constructor(private readonly db: DB) {}

  listByUser(userId: number): AddressRow[] {
    return this.db
      .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_selected DESC, id')
      .all(userId) as AddressRow[];
  }

  findById(userId: number, id: number): AddressRow | undefined {
    return this.db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(id, userId) as
      | AddressRow
      | undefined;
  }

  findSelected(userId: number): AddressRow | undefined {
    return this.db.prepare('SELECT * FROM addresses WHERE user_id = ? AND is_selected = 1').get(userId) as
      | AddressRow
      | undefined;
  }

  create(userId: number, f: AddressFields, now: string): number {
    const info = this.db
      .prepare(
        `INSERT INTO addresses (user_id, label, cep, street, complement, neighborhood, city, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, f.label, f.cep, f.street, f.complement, f.neighborhood, f.city, now, now);
    return Number(info.lastInsertRowid);
  }

  update(userId: number, id: number, f: Partial<AddressFields>, now: string): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [col, value] of Object.entries(f)) {
      if (value === undefined) continue;
      sets.push(`${col} = ?`);
      values.push(value);
    }
    if (!sets.length) return;
    this.db
      .prepare(`UPDATE addresses SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(...values, now, id, userId);
  }

  delete(userId: number, id: number): void {
    this.db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(id, userId);
  }

  /** Deve ser chamado dentro de transação: desmarca o atual e marca o novo. */
  select(userId: number, id: number, now: string): void {
    this.db.prepare('UPDATE addresses SET is_selected = 0 WHERE user_id = ? AND is_selected = 1').run(userId);
    this.db
      .prepare('UPDATE addresses SET is_selected = 1, updated_at = ? WHERE id = ? AND user_id = ?')
      .run(now, id, userId);
  }

  mostRecentId(userId: number): number | undefined {
    const row = this.db.prepare('SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as
      | { id: number }
      | undefined;
    return row?.id;
  }
}
