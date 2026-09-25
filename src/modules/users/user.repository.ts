import type { DB } from '../../db/connection';

export type Theme = 'light' | 'dark' | 'system';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  avatar_path: string | null;
  theme: Theme;
  notify_orders: 0 | 1;
  notify_promos: 0 | 1;
  notify_news: 0 | 1;
  terms_accepted_at: string;
  created_at: string;
  updated_at: string;
}

export interface NewUser {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  now: string;
}

export interface SettingsPatch {
  theme?: Theme;
  notifyOrders?: boolean;
  notifyPromos?: boolean;
  notifyNews?: boolean;
}

export class UserRepository {
  constructor(private readonly db: DB) {}

  findById(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  findByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  emailTaken(email: string, exceptUserId?: number): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM users WHERE email = ? AND id != ?')
      .get(email, exceptUserId ?? -1);
    return !!row;
  }

  create(u: NewUser): UserRow {
    const info = this.db
      .prepare(
        `INSERT INTO users (name, email, phone, password_hash, terms_accepted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(u.name, u.email, u.phone, u.passwordHash, u.now, u.now, u.now);
    return this.findById(Number(info.lastInsertRowid))!;
  }

  updateProfile(id: number, fields: { name?: string; email?: string; phone?: string }, now: string): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [col, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      sets.push(`${col} = ?`);
      values.push(value);
    }
    if (!sets.length) return;
    this.db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...values, now, id);
  }

  updatePassword(id: number, passwordHash: string, now: string): void {
    this.db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, now, id);
  }

  setAvatar(id: number, avatarPath: string | null, now: string): void {
    this.db.prepare('UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?').run(avatarPath, now, id);
  }

  updateSettings(id: number, patch: SettingsPatch, now: string): void {
    const map: Record<keyof SettingsPatch, string> = {
      theme: 'theme',
      notifyOrders: 'notify_orders',
      notifyPromos: 'notify_promos',
      notifyNews: 'notify_news',
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const key of Object.keys(map) as (keyof SettingsPatch)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      sets.push(`${map[key]} = ?`);
      values.push(typeof value === 'boolean' ? Number(value) : value);
    }
    if (!sets.length) return;
    this.db.prepare(`UPDATE users SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...values, now, id);
  }
}
