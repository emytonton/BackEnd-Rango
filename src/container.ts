import type { AppConfig } from './config';
import type { DB } from './db/connection';
import type { Clock } from './lib/clock';
import { AddressRepository } from './modules/addresses/address.repository';
import { AddressService } from './modules/addresses/address.service';
import { AuthService, type AccessTokenIssuer } from './modules/auth/auth.service';
import { SessionRepository } from './modules/auth/session.repository';
import { CartRepository } from './modules/cart/cart.repository';
import { CartService } from './modules/cart/cart.service';
import { CatalogRepository } from './modules/catalog/catalog.repository';
import { CatalogService } from './modules/catalog/catalog.service';
import { NotificationRepository } from './modules/notifications/notification.repository';
import { NotificationService } from './modules/notifications/notification.service';
import { OrderRepository } from './modules/orders/order.repository';
import { OrderService } from './modules/orders/order.service';
import { PaymentMethodRepository } from './modules/payment-methods/payment-method.repository';
import { PaymentMethodService } from './modules/payment-methods/payment-method.service';
import { ProfileService } from './modules/users/profile.service';
import { UserRepository } from './modules/users/user.repository';

/** Composição manual das dependências (sem framework de DI — o projeto é pequeno). */
export function createServices(db: DB, config: AppConfig, clock: Clock, issueAccessToken: AccessTokenIssuer) {
  const users = new UserRepository(db);
  const sessions = new SessionRepository(db);
  const addressRepo = new AddressRepository(db);
  const paymentRepo = new PaymentMethodRepository(db);
  const catalogRepo = new CatalogRepository(db);
  const cartRepo = new CartRepository(db);
  const orderRepo = new OrderRepository(db);
  const notificationRepo = new NotificationRepository(db);

  const notifications = new NotificationService(notificationRepo, users, clock);
  const cart = new CartService(db, cartRepo, catalogRepo, config, clock);

  return {
    auth: new AuthService(db, users, sessions, paymentRepo, notifications, issueAccessToken, config, clock),
    profile: new ProfileService(users, config, clock),
    addresses: new AddressService(db, addressRepo, clock),
    paymentMethods: new PaymentMethodService(paymentRepo, clock),
    catalog: new CatalogService(catalogRepo, clock),
    cart,
    orders: new OrderService(db, orderRepo, cart, addressRepo, paymentRepo, notifications, config, clock),
    notifications,
    users,
  };
}

export type Services = ReturnType<typeof createServices>;
