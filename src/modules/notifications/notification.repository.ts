import type { DB } from '../../db/connection';

export type NotificationKind = 'order' | 'promo' | 'news';

export interface NotificationRow {
  id: number;
  user_id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  order_id: number | null;
  read_at: string | null;
  created_at: string;
}

export interface NewNotification {
  userId: number;
  kind: NotificationKind;
  title: string;
  body: string;
  orderId?: number | null;
  createdAt: string;
  readAt?: string | null;
}

export class NotificationRepository {
  constructor(private readonly db: DB) {}

  create(n: NewNotification): number {
    const info = this.db
      .prepare(
        `INSERT INTO notifications (user_id, kind, title, body, order_id, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(n.userId, n.kind, n.title, n.body, n.orderId ?? null, n.readAt ?? null, n.createdAt);
    return Number(info.lastInsertRowid);
  }

  list(userId: number, unreadOnly: boolean, limit: number, offset: number): NotificationRow[] {
    return this.db
      .prepare(
        `SELECT * FROM notifications
         WHERE user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''}
         ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(userId, limit, offset) as NotificationRow[];
  }

  count(userId: number, unreadOnly: boolean): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''}`)
      .get(userId) as { n: number };
    return row.n;
  }

  findById(userId: number, id: number): NotificationRow | undefined {
    return this.db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(id, userId) as
      | NotificationRow
      | undefined;
  }

  markRead(userId: number, id: number, now: string): void {
    this.db
      .prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL')
      .run(now, id, userId);
  }

  markAllRead(userId: number, now: string): void {
    this.db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now, userId);
  }
}
