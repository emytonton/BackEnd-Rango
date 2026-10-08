import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, createTestApp, loginDemo, registerUser, type TestContext } from '../helpers';

let ctx: TestContext;
let call: ReturnType<typeof api>;
let pixId: number;
let cashId: number;

const address = { label: 'Casa', cep: '05422030', street: 'Rua das Palmeiras, 128', complement: 'apto 42', neighborhood: 'Pinheiros', city: 'São Paulo' };

beforeEach(async () => {
  ctx = await createTestApp();
  const u = await registerUser(ctx.app);
  call = api(ctx.app, u.authHeader);
  const methods = (await call('GET', '/payment-methods')).json().data;
  pixId = methods.find((m: { type: string }) => m.type === 'pix').id;
  cashId = methods.find((m: { type: string }) => m.type === 'cash').id;
});
afterEach(async () => {
  await ctx.close();
});

async function checkout(extra: Record<string, unknown> = {}) {
  return call('POST', '/orders', { paymentMethodId: pixId, ...extra });
}

describe('checkout (POST /orders)', () => {
  it('recusa carrinho vazio', async () => {
    const res = await checkout();
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('EMPTY_CART');
  });

  it('exige endereço de entrega', async () => {
    await call('POST', '/cart/items', { productId: 'p1' });
    const res = await checkout();
    expect(res.json().error.code).toBe('ADDRESS_REQUIRED');
  });

  it('cria o pedido a partir do carrinho, limpa o carrinho e notifica', async () => {
    await call('POST', '/addresses', address);
    await call('POST', '/cart/items', { productId: 'p1', addonIds: ['a1'] });
    await call('POST', '/cart/items', { productId: 'p12', quantity: 2 });
    await call('PUT', '/cart/coupon', { code: 'RANGO10' });

    const res = await checkout();
    expect(res.statusCode).toBe(201);
    const order = res.json();
    expect(order).toMatchObject({
      code: `RG-${order.id}`,
      status: 'live',
      step: 1,
      statusLabel: 'Pedido confirmado',
      itemCount: 3,
      itemsSummary: '1× Burger duplo cheddar, 2× Limonada suíça',
      canCancel: true,
      address: { label: 'Casa', line: 'Rua das Palmeiras, 128 · apto 42', cityLine: 'Pinheiros · São Paulo' },
      payment: { type: 'pix', label: 'PIX', changeFor: null },
      // 38,90 + 19,80 = 58,70 → entrega 7,90; desconto 5,87
      amounts: { subtotal: 58.7, deliveryFee: 7.9, discount: 5.87, total: 60.73, couponCode: 'RANGO10' },
      estimatedDelivery: { minMinutes: 25, maxMinutes: 35 },
    });
    expect(order.timeline.map((t: { state: string }) => t.state)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(order.items[0]).toMatchObject({ name: 'Burger duplo cheddar', unitPrice: 38.9, addons: [{ id: 'a1' }] });

    const cart = (await call('GET', '/cart')).json();
    expect(cart.items).toEqual([]);
    expect(cart.coupon).toBeNull();

    const notifs = (await call('GET', '/notifications')).json();
    expect(notifs.data[0]).toMatchObject({
      kind: 'order',
      title: 'Seu pedido foi confirmado',
      orderId: order.id,
      orderCode: order.code,
      isRead: false,
    });
  });

  it('valida troco: só em dinheiro e maior que o total', async () => {
    await call('POST', '/addresses', address);
    await call('POST', '/cart/items', { productId: 'p2' });
    expect((await checkout({ changeFor: 100 })).json().error.code).toBe('INVALID_CHANGE');
    expect((await checkout({ paymentMethodId: cashId, changeFor: 20 })).json().error.code).toBe('INVALID_CHANGE');
    const ok = await checkout({ paymentMethodId: cashId, changeFor: 100 });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().payment).toMatchObject({ type: 'cash', changeFor: 100 });
  });

  it('recusa forma de pagamento ou endereço de outro usuário', async () => {
    await call('POST', '/addresses', address);
    await call('POST', '/cart/items', { productId: 'p2' });
    const other = await registerUser(ctx.app);
    const otherPm = (await ctx.app.inject({ method: 'GET', url: '/payment-methods', headers: other.authHeader })).json().data[0].id;
    expect((await checkout({ paymentMethodId: otherPm })).statusCode).toBe(404);
  });

  it('bloqueia checkout com produto que ficou indisponível', async () => {
    await call('POST', '/addresses', address);
    await call('POST', '/cart/items', { productId: 'p3' });
    ctx.db.prepare("UPDATE products SET is_available = 0 WHERE id = 'p3'").run();
    const res = await checkout();
    expect(res.json().error.code).toBe('PRODUCT_UNAVAILABLE');
  });
});

describe('acompanhamento do pedido', () => {
  async function placeOrder() {
    await call('POST', '/addresses', address);
    await call('POST', '/cart/items', { productId: 'p5' });
    return (await checkout()).json();
  }

  it('avança as etapas com o tempo e notifica saída e entrega', async () => {
    const order = await placeOrder();

    ctx.clock.advance(10);
    expect((await call('GET', `/orders/${order.code}`)).json()).toMatchObject({ step: 2, statusLabel: 'Em preparação' });

    ctx.clock.advance(10);
    const out = (await call('GET', `/orders/${order.id}`)).json();
    expect(out).toMatchObject({ step: 3, statusLabel: 'Saiu para entrega', canCancel: false });

    ctx.clock.advance(60);
    const done = (await call('GET', `/orders/${order.id}`)).json();
    expect(done).toMatchObject({ status: 'done', step: 4, statusLabel: 'Entregue' });
    expect(done.timeline.every((t: { state: string; reachedAt: string | null }) => t.state === 'done' && t.reachedAt)).toBe(true);

    const titles = (await call('GET', '/notifications')).json().data.map((n: { title: string }) => n.title);
    expect(titles.slice(0, 3)).toEqual(['Seu pedido chegou!', 'Seu pedido saiu para entrega', 'Seu pedido foi confirmado']);
  });

  it('a central de notificações também avança os pedidos (útil para push via polling)', async () => {
    await placeOrder();
    ctx.clock.advance(20);
    const notifs = (await call('GET', '/notifications?unreadOnly=true')).json();
    expect(notifs.data[0].title).toBe('Seu pedido saiu para entrega');
  });

  it('respeita a preferência de notificações de pedidos', async () => {
    await call('PATCH', '/me/settings', { notifications: { orders: false } });
    await placeOrder();
    ctx.clock.advance(100);
    const notifs = (await call('GET', '/notifications')).json();
    expect(notifs.data.filter((n: { kind: string }) => n.kind === 'order')).toEqual([]);
  });

  it('cancela somente até a confirmação', async () => {
    const order = await placeOrder();
    const cancelled = await call('POST', `/orders/${order.id}/cancel`);
    expect(cancelled.json()).toMatchObject({ status: 'cancel', statusLabel: 'Cancelado', canCancel: false });
    ctx.clock.advance(100);
    expect((await call('GET', `/orders/${order.id}`)).json().status).toBe('cancel');

    await call('POST', '/cart/items', { productId: 'p5' });
    const second = (await checkout()).json();
    ctx.clock.advance(10);
    const res = await call('POST', `/orders/${second.id}/cancel`);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('ORDER_NOT_CANCELLABLE');
  });

  it('pedido de outro usuário é 404', async () => {
    const order = await placeOrder();
    const other = await registerUser(ctx.app);
    const res = await ctx.app.inject({ method: 'GET', url: `/orders/${order.id}`, headers: other.authHeader });
    expect(res.statusCode).toBe(404);
    expect((await call('GET', '/orders/abc')).statusCode).toBe(400);
  });
});

describe('histórico (usuária demo do protótipo)', () => {
  let demo: ReturnType<typeof api>;
  beforeEach(async () => {
    demo = api(ctx.app, (await loginDemo(ctx)).authHeader);
  });

  it('separa "Em andamento" e "Anteriores"', async () => {
    const live = (await demo('GET', '/orders?group=live')).json();
    expect(live.data.map((o: { code: string }) => o.code)).toEqual(['RG-10482']);
    expect(live.data[0]).toMatchObject({ statusLabel: 'Em preparação', itemCount: 3 });

    const past = (await demo('GET', '/orders?group=past')).json();
    expect(past.data.map((o: { code: string; status: string }) => [o.code, o.status])).toEqual([
      ['RG-10391', 'done'],
      ['RG-10344', 'done'],
      ['RG-10298', 'cancel'],
    ]);
    expect((await demo('GET', '/orders')).json().meta.total).toBe(4);
  });

  it('detalha pedido anterior com produtos, endereço, pagamento e valores', async () => {
    const detail = (await demo('GET', '/orders/RG-10344')).json();
    expect(detail).toMatchObject({
      status: 'done',
      address: { label: 'Trabalho', line: 'Av. Faria Lima, 3400 · 9º andar' },
      payment: { type: 'cash', label: 'Dinheiro' },
      amounts: { subtotal: 82.5, deliveryFee: 0, total: 82.5 },
    });
    expect(detail.items.map((i: { name: string }) => i.name)).toEqual([
      'Feijoada completa',
      'Brownie com sorvete',
      'Suco verde detox',
    ]);
  });

  it('"Pedir novamente" substitui o carrinho e ignora produtos indisponíveis', async () => {
    await demo('POST', '/cart/items', { productId: 'p9' });
    ctx.db.prepare("UPDATE products SET is_available = 0 WHERE id = 'p6'").run();
    const res = await demo('POST', '/orders/RG-10344/reorder');
    expect(res.statusCode).toBe(200);
    const { cart, skippedProductIds } = res.json();
    expect(skippedProductIds).toEqual(['p6']);
    expect(cart.items.map((i: { product: { id: string } }) => i.product.id)).toEqual(['p4', 'p5']);
  });

  it('marca notificações como lidas', async () => {
    const list = (await demo('GET', '/notifications')).json();
    expect(list.unreadCount).toBe(1);
    const unread = list.data.find((n: { isRead: boolean }) => !n.isRead);
    const read = await demo('POST', `/notifications/${unread.id}/read`);
    expect(read.json().isRead).toBe(true);
    expect((await demo('GET', '/notifications')).json().unreadCount).toBe(0);
    expect((await demo('POST', '/notifications/read-all')).json()).toEqual({ unreadCount: 0 });
    expect((await demo('POST', '/notifications/99999/read')).statusCode).toBe(404);
  });
});
