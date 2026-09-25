import type { Clock } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import { buildMeta } from '../../lib/pagination';
import type { UserRepository } from '../users/user.repository';
import type { NewNotification, NotificationRepository } from './notification.repository';
import { toNotificationDto } from './notification.schemas';

export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Cria a notificação somente se o usuário permite aquele tipo
   * (Configurações → Notificações: pedidos, promoções, novidades).
   */
  notify(n: Omit<NewNotification, 'createdAt'> & { createdAt?: string }): number | null {
    const user = this.users.findById(n.userId);
    if (!user) return null;
    const allowed = { order: user.notify_orders, promo: user.notify_promos, news: user.notify_news }[n.kind];
    if (!allowed) return null;
    return this.notifications.create({ ...n, createdAt: n.createdAt ?? this.clock.now().toISOString() });
  }

  list(userId: number, unreadOnly: boolean, page: number, pageSize: number) {
    const total = this.notifications.count(userId, unreadOnly);
    const rows = this.notifications.list(userId, unreadOnly, pageSize, (page - 1) * pageSize);
    return {
      data: rows.map(toNotificationDto),
      meta: buildMeta(page, pageSize, total),
      unreadCount: this.notifications.count(userId, true),
    };
  }

  unreadCount(userId: number): number {
    return this.notifications.count(userId, true);
  }

  markRead(userId: number, id: number) {
    if (!this.notifications.findById(userId, id)) throw notFound('Notificação não encontrada.');
    this.notifications.markRead(userId, id, this.clock.now().toISOString());
    return toNotificationDto(this.notifications.findById(userId, id)!);
  }

  markAllRead(userId: number) {
    this.notifications.markAllRead(userId, this.clock.now().toISOString());
    return { unreadCount: 0 };
  }
}
