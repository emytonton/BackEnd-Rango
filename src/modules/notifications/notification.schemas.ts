import { z } from 'zod';
import { paginationMeta, paginationQuery } from '../../lib/pagination';
import { formatOrderCode } from '../orders/order-status';
import type { NotificationRow } from './notification.repository';

export const notificationDto = z.object({
  id: z.number().int(),
  kind: z.enum(['order', 'promo', 'news']),
  title: z.string(),
  body: z.string(),
  orderId: z.number().int().nullable().describe('Deep link: abrir GET /orders/{orderId}'),
  orderCode: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.string().describe('O app formata como "há 4 min", "ontem"...'),
});

export const listNotificationsQuery = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  ...paginationQuery,
});

export const notificationListResponse = z.object({
  data: z.array(notificationDto),
  meta: paginationMeta,
  unreadCount: z.number().int(),
});

export function toNotificationDto(n: NotificationRow): z.infer<typeof notificationDto> {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    orderId: n.order_id,
    orderCode: n.order_id ? formatOrderCode(n.order_id) : null,
    isRead: n.read_at !== null,
    createdAt: n.created_at,
  };
}
