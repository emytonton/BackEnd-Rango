import bcrypt from 'bcryptjs';
import type { AppConfig } from '../config';
import type { Clock } from '../lib/clock';
import { toCents } from '../lib/money';
import { normalize } from '../lib/text';
import { formatAddressLine, formatCityLine } from '../modules/addresses/address.schemas';
import { addonKey, computeTotals, unitPriceCents } from '../modules/cart/pricing';
import { COURIERS, formatOrderCode } from '../modules/orders/order-status';
import { PAYMENT_LABELS, paymentDetail } from '../modules/payment-methods/payment-method.schemas';
import type { DB } from './connection';
import {
  ADDONS,
  CATEGORIES,
  COUPONS,
  DEMO_ADDRESSES,
  DEMO_FAVORITES,
  DEMO_ORDERS,
  DEMO_PAYMENT_METHODS,
  DEMO_RECENT_SEARCHES,
  DEMO_USER,
  PRODUCTS,
} from './seed-data';

const slugify = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Catálogo (categorias, produtos, adicionais, cupons). Idempotente: pode rodar a cada inicialização. */
export function seedCatalog(db: DB): void {
  db.transaction(() => {
    const upsertCategory = db.prepare(
      `INSERT INTO categories (name, slug, position) VALUES (?, ?, ?)
       ON CONFLICT (name) DO UPDATE SET slug = excluded.slug, position = excluded.position`,
    );
    CATEGORIES.forEach((name, i) => upsertCategory.run(name, slugify(name), i + 1));
    const categoryId = new Map(
      (db.prepare('SELECT id, name FROM categories').all() as { id: number; name: string }[]).map((c) => [c.name, c.id]),
    );

    const upsertProduct = db.prepare(
      `INSERT INTO products (id, name, restaurant, category_id, description, ingredients, price_cents, old_price_cents,
         rating, delivery_min, delivery_max, image_hue, image_url, position, search_text)
       VALUES (@id, @name, @restaurant, @categoryId, @description, @ingredients, @price, @oldPrice,
         @rating, @min, @max, @hue, @imageUrl, @position, @searchText)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, restaurant = excluded.restaurant,
         category_id = excluded.category_id, description = excluded.description, ingredients = excluded.ingredients,
         price_cents = excluded.price_cents, old_price_cents = excluded.old_price_cents, rating = excluded.rating,
         delivery_min = excluded.delivery_min, delivery_max = excluded.delivery_max, image_hue = excluded.image_hue,
         image_url = excluded.image_url,
         position = excluded.position, search_text = excluded.search_text`,
    );
    const clearTags = db.prepare('DELETE FROM product_tags WHERE product_id = ?');
    const insertTag = db.prepare('INSERT INTO product_tags (product_id, tag) VALUES (?, ?)');
    PRODUCTS.forEach((p, i) => {
      upsertProduct.run({
        id: p.id,
        name: p.name,
        restaurant: p.restaurant,
        categoryId: categoryId.get(p.category),
        description: p.description,
        ingredients: p.ingredients,
        price: toCents(p.price),
        oldPrice: p.oldPrice ? toCents(p.oldPrice) : null,
        rating: p.rating,
        min: p.time[0],
        max: p.time[1],
        hue: p.hue,
        imageUrl: p.image ?? null,
        position: i + 1,
        searchText: normalize(`${p.name} ${p.restaurant} ${p.category}`),
      });
      clearTags.run(p.id);
      p.tags.forEach((t) => insertTag.run(p.id, t));
    });

    const upsertAddon = db.prepare(
      `INSERT INTO addons (id, name, price_cents, position) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, price_cents = excluded.price_cents, position = excluded.position`,
    );
    ADDONS.forEach((a, i) => upsertAddon.run(a.id, a.name, toCents(a.price), i + 1));

    const upsertCoupon = db.prepare(
      `INSERT INTO coupons (code, description, percent_off, min_subtotal_cents) VALUES (?, ?, ?, ?)
       ON CONFLICT (code) DO UPDATE SET description = excluded.description, percent_off = excluded.percent_off,
         min_subtotal_cents = excluded.min_subtotal_cents`,
    );
    COUPONS.forEach((c) => upsertCoupon.run(c.code, c.description, c.percentOff, toCents(c.minSubtotal)));
  })();
}

/**
 * Usuária de demonstração do protótipo (marina.alves@email.com / rango123) com endereços,
 * formas de pagamento, favoritos, histórico de pedidos e notificações. Não faz nada se já existir.
 * Retorna true quando criou os dados.
 */
export function seedDemoUser(db: DB, config: AppConfig, clock: Clock): boolean {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO_USER.email)) return false;

  const now = clock.now();
  const iso = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const passwordHash = bcrypt.hashSync(DEMO_USER.password, config.bcryptRounds);

  db.transaction(() => {
    const userId = Number(
      db
        .prepare(
          `INSERT INTO users (name, email, phone, password_hash, terms_accepted_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(DEMO_USER.name, DEMO_USER.email, DEMO_USER.phone, passwordHash, iso(60 * 24 * 120), iso(60 * 24 * 120), iso(0))
        .lastInsertRowid,
    );

    const addressIds = DEMO_ADDRESSES.map((a) =>
      Number(
        db
          .prepare(
            `INSERT INTO addresses (user_id, label, cep, street, complement, neighborhood, city, is_selected, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(userId, a.label, a.cep, a.street, a.complement, a.neighborhood, a.city, Number(a.selected), iso(0), iso(0))
          .lastInsertRowid,
      ),
    );

    for (const m of DEMO_PAYMENT_METHODS) {
      db.prepare('INSERT INTO payment_methods (user_id, type, brand, last4, created_at) VALUES (?, ?, ?, ?, ?)').run(
        userId,
        m.type,
        m.brand,
        m.last4,
        iso(0),
      );
    }

    DEMO_FAVORITES.forEach((pid) =>
      db.prepare('INSERT INTO favorites (user_id, product_id, created_at) VALUES (?, ?, ?)').run(userId, pid, iso(0)),
    );
    DEMO_RECENT_SEARCHES.forEach((term, i) =>
      db.prepare('INSERT INTO recent_searches (user_id, term, searched_at) VALUES (?, ?, ?)').run(userId, term, iso(i + 1)),
    );

    const productById = new Map(PRODUCTS.map((p) => [p.id, p]));
    const addonById = new Map(ADDONS.map((a) => [a.id, a]));

    for (const o of DEMO_ORDERS) {
      const lines = o.items.map((i) => {
        const product = productById.get(i.productId)!;
        const addons = addonKey(i.addons)
          .split(',')
          .filter(Boolean)
          .map((id) => addonById.get(id)!);
        const unit = unitPriceCents(toCents(product.price), addons.map((a) => toCents(a.price)));
        return { product, addons, quantity: i.quantity, unit };
      });
      const totals = computeTotals(lines.reduce((s, l) => s + l.unit * l.quantity, 0), config);
      const address = DEMO_ADDRESSES[o.address];
      const pm = DEMO_PAYMENT_METHODS.find((m) => m.type === o.paymentType)!;
      const courier = COURIERS[0];
      const createdAt = iso(o.minutesAgo);

      db.prepare(
        `INSERT INTO orders (id, user_id, status, step, subtotal_cents, delivery_fee_cents, discount_cents, total_cents,
           coupon_code, address_id, address_label, address_line, address_city, payment_type, payment_label, payment_detail,
           change_for_cents, eta_min, eta_max, courier_name, courier_vehicle, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        o.id,
        userId,
        o.status,
        o.step,
        totals.subtotalCents,
        totals.deliveryFeeCents,
        totals.discountCents,
        totals.totalCents,
        addressIds[o.address],
        address.label,
        formatAddressLine(address),
        formatCityLine(address),
        pm.type,
        PAYMENT_LABELS[pm.type],
        paymentDetail(pm),
        pm.type === 'cash' ? 10000 : null,
        Math.max(...lines.map((l) => l.product.time[0])),
        Math.max(...lines.map((l) => l.product.time[1])),
        courier.name,
        courier.vehicle,
        createdAt,
        createdAt,
      );
      for (const l of lines) {
        db.prepare(
          `INSERT INTO order_items (order_id, product_id, product_name, image_hue, quantity, unit_price_cents, addons_json, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, '')`,
        ).run(
          o.id,
          l.product.id,
          l.product.name,
          l.product.hue,
          l.quantity,
          l.unit,
          JSON.stringify(l.addons.map((a) => ({ id: a.id, name: a.name, price_cents: toCents(a.price) }))),
        );
      }
      // etapas espaçadas em ~8 min; no pedido em andamento a etapa atual acontece "agora"
      for (let step = 0; step <= o.step; step++) {
        const at = o.status === 'live' && step === o.step ? iso(0) : iso(Math.max(0, o.minutesAgo - step * 8));
        db.prepare('INSERT INTO order_events (order_id, step, created_at) VALUES (?, ?, ?)').run(o.id, step, at);
      }
    }

    const notifications = [
      { kind: 'order', title: 'Seu pedido foi confirmado', body: `Pedido ${formatOrderCode(10482)} · pagamento aprovado via PIX.`, orderId: 10482, minutesAgo: 22, read: true },
      { kind: 'promo', title: 'Tem promoção nova esperando por você', body: 'Use o cupom RANGO10 e ganhe 10% de desconto no seu pedido.', orderId: null, minutesAgo: 60, read: false },
      { kind: 'order', title: 'Seu pedido chegou!', body: `Pedido ${formatOrderCode(10391)} entregue. Avalie sua experiência.`, orderId: 10391, minutesAgo: 60 * 24, read: true },
    ];
    for (const n of notifications) {
      db.prepare(
        'INSERT INTO notifications (user_id, kind, title, body, order_id, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(userId, n.kind, n.title, n.body, n.orderId, n.read ? iso(n.minutesAgo - 1) : null, iso(n.minutesAgo));
    }
  })();
  return true;
}
