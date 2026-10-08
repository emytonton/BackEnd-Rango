import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, createTestApp, registerUser, type TestContext } from '../helpers';

let ctx: TestContext;
let call: ReturnType<typeof api>;

beforeEach(async () => {
  ctx = await createTestApp();
  const u = await registerUser(ctx.app);
  call = api(ctx.app, u.authHeader);
});
afterEach(async () => {
  await ctx.close();
});

describe('carrinho', () => {
  it('começa vazio', async () => {
    const res = await call('GET', '/cart');
    expect(res.json()).toEqual({
      items: [],
      coupon: null,
      summary: { itemCount: 0, subtotal: 0, deliveryFee: 0, discount: 0, total: 0, freeDeliveryThreshold: 60 },
    });
  });

  it('adiciona produto com adicionais e calcula preço unitário, taxa e total', async () => {
    const res = await call('POST', '/cart/items', { productId: 'p1', quantity: 1, addonIds: ['a1'], notes: 'sem cebola' });
    expect(res.statusCode).toBe(201);
    const cart = res.json();
    expect(cart.items[0]).toMatchObject({
      product: { id: 'p1', name: 'Burger duplo cheddar' },
      quantity: 1,
      unitPrice: 38.9,
      total: 38.9,
      notes: 'sem cebola',
      addons: [{ id: 'a1', name: 'Bacon extra', price: 4 }],
    });
    expect(cart.summary).toMatchObject({ itemCount: 1, subtotal: 38.9, deliveryFee: 7.9, total: 46.8 });
  });

  it('soma na mesma linha quando produto e adicionais coincidem (ordem dos adicionais não importa)', async () => {
    await call('POST', '/cart/items', { productId: 'p1', addonIds: ['a3', 'a1'] });
    await call('POST', '/cart/items', { productId: 'p1', addonIds: ['a1', 'a3'], quantity: 2 });
    const res = await call('POST', '/cart/items', { productId: 'p1' });
    const items = res.json().items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ quantity: 3, unitPrice: 40.9 });
    expect(items[1]).toMatchObject({ quantity: 1, unitPrice: 34.9 });
  });

  it('entrega grátis a partir de R$ 60', async () => {
    const res = await call('POST', '/cart/items', { productId: 'p4', quantity: 2 });
    expect(res.json().summary).toMatchObject({ subtotal: 104, deliveryFee: 0, total: 104 });
  });

  it('altera quantidade, observação e remove itens', async () => {
    const added = await call('POST', '/cart/items', { productId: 'p12' });
    const id = added.json().items[0].id;

    const updated = await call('PATCH', `/cart/items/${id}`, { quantity: 3, notes: 'bem gelada' });
    expect(updated.json().items[0]).toMatchObject({ quantity: 3, notes: 'bem gelada', total: 29.7 });

    expect((await call('PATCH', `/cart/items/${id}`, { quantity: 0 })).statusCode).toBe(400);

    const removed = await call('DELETE', `/cart/items/${id}`);
    expect(removed.json().items).toEqual([]);
    expect((await call('DELETE', `/cart/items/${id}`)).statusCode).toBe(404);
  });

  it('aplica e remove o cupom RANGO10 (10% do subtotal)', async () => {
    await call('POST', '/cart/items', { productId: 'p2' });
    const res = await call('PUT', '/cart/coupon', { code: 'rango10' });
    expect(res.statusCode).toBe(200);
    expect(res.json().coupon).toMatchObject({ code: 'RANGO10', percentOff: 10, applied: true });
    expect(res.json().summary).toMatchObject({ subtotal: 45, discount: 4.5, deliveryFee: 7.9, total: 48.4 });

    const removed = await call('DELETE', '/cart/coupon');
    expect(removed.json().coupon).toBeNull();
    expect(removed.json().summary.discount).toBe(0);
  });

  it('recusa cupom inválido', async () => {
    const res = await call('PUT', '/cart/coupon', { code: 'NAOEXISTE' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: 'INVALID_COUPON', message: 'Cupom inválido.' });
  });

  it('valida produto, adicional e limite de quantidade', async () => {
    expect((await call('POST', '/cart/items', { productId: 'p999' })).json().error.code).toBe('PRODUCT_NOT_FOUND');
    expect((await call('POST', '/cart/items', { productId: 'p1', addonIds: ['zz'] })).json().error.code).toBe('INVALID_ADDON');
    await call('POST', '/cart/items', { productId: 'p1', quantity: 99 });
    expect((await call('POST', '/cart/items', { productId: 'p1' })).json().error.code).toBe('QUANTITY_LIMIT');
  });

  it('produto indisponível não entra no carrinho', async () => {
    ctx.db.prepare("UPDATE products SET is_available = 0 WHERE id = 'p3'").run();
    const res = await call('POST', '/cart/items', { productId: 'p3' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('PRODUCT_UNAVAILABLE');
  });

  it('esvazia o carrinho', async () => {
    await call('POST', '/cart/items', { productId: 'p1' });
    await call('PUT', '/cart/coupon', { code: 'RANGO10' });
    const res = await call('DELETE', '/cart');
    expect(res.json().items).toEqual([]);
    expect(res.json().coupon).toBeNull();
  });

  it('o carrinho persiste entre sessões do mesmo usuário (estado compartilhado)', async () => {
    const u = await registerUser(ctx.app);
    await ctx.app.inject({ method: 'POST', url: '/cart/items', headers: u.authHeader, payload: { productId: 'p5', quantity: 2 } });
    const login = await ctx.app.inject({ method: 'POST', url: '/auth/login', payload: { email: u.email, password: u.password } });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/cart',
      headers: { authorization: `Bearer ${login.json().accessToken}` },
    });
    expect(res.json().summary.itemCount).toBe(2);
  });
});
