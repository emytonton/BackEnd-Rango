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

const ids = (res: { json(): { data: { id: string }[] } }) => res.json().data.map((p) => p.id);

describe('catálogo', () => {
  it('lista as categorias do protótipo em ordem', async () => {
    const res = await call('GET', '/categories');
    expect(res.json().data.map((c: { name: string }) => c.name)).toEqual([
      'Hambúrguer',
      'Pizza',
      'Massas',
      'Brasileira',
      'Sobremesas',
      'Bebidas',
    ]);
  });

  it('lista produtos paginados com o formato esperado', async () => {
    const res = await call('GET', '/products?pageSize=5&page=2');
    const body = res.json();
    expect(body.meta).toEqual({ page: 2, pageSize: 5, total: 14, totalPages: 3 });
    expect(body.data).toHaveLength(5);
    expect(body.data[0]).toMatchObject({
      id: 'p6',
      name: 'Suco verde detox',
      price: 12,
      oldPrice: null,
      deliveryTime: { min: 10, max: 20 },
      category: { name: 'Bebidas', slug: 'bebidas' },
      isFavorite: false,
    });
  });

  it('busca por nome, restaurante ou categoria ignorando acentos e caixa', async () => {
    expect(ids(await call('GET', '/products?q=ACAI'))).toEqual(['p13']);
    expect(ids(await call('GET', '/products?q=casa%20do%20burger'))).toEqual(['p1', 'p7', 'p14']);
    expect(ids(await call('GET', '/products?q=hamburguer'))).toEqual(['p1', 'p7', 'p14']);
  });

  it('filtra por categoria (slug ou nome) e trata "Todos" como sem filtro', async () => {
    expect(ids(await call('GET', '/products?category=pizza'))).toEqual(['p2', 'p8']);
    expect(ids(await call('GET', `/products?category=${encodeURIComponent('Hambúrguer')}`))).toEqual(['p1', 'p7', 'p14']);
    expect((await call('GET', '/products?category=Todos')).json().meta.total).toBe(14);
  });

  it('aplica filtros combinados e ordenação', async () => {
    const res = await call('GET', '/products?maxPrice=30&minRating=4.7&maxDeliveryTime=30&sort=price_desc');
    // R$ 29,90 · 24,90 · 22,00 · 18,50 — todos com nota ≥ 4,7 e entrega em até 30 min
    expect(ids(res)).toEqual(['p7', 'p13', 'p11', 'p5']);
    const prices = (await call('GET', '/products?sort=price_asc')).json().data.map((p: { price: number }) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const ratings = (await call('GET', '/products?sort=rating')).json().data.map((p: { rating: number }) => p.rating);
    expect(ratings[0]).toBe(4.9);
  });

  it('retorna lista vazia quando nada é encontrado', async () => {
    const res = await call('GET', '/products?q=sushi');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 1 } });
  });

  it('valida parâmetros de consulta', async () => {
    const res = await call('GET', '/products?sort=preco&pageSize=500');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('detalha o produto com ingredientes e adicionais', async () => {
    const res = await call('GET', '/products/p1');
    expect(res.json()).toMatchObject({
      id: 'p1',
      price: 34.9,
      oldPrice: 42.9,
      ingredients: expect.stringContaining('brioche'),
      addons: [
        { id: 'a1', name: 'Bacon extra', price: 4 },
        { id: 'a2', name: 'Cheddar extra', price: 3.5 },
        { id: 'a3', name: 'Molho da casa', price: 2 },
        { id: 'a4', name: 'Refrigerante 350ml', price: 7 },
      ],
    });
    expect((await call('GET', '/products/p999')).json().error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('monta a Home com cabeçalho, categorias e as 4 seções', async () => {
    const res = await call('GET', '/home');
    const body = res.json();
    expect(body.user).toMatchObject({ name: 'Ana Teste', firstName: 'Ana' });
    expect(body.selectedAddress).toBeNull();
    expect(body.cartItemCount).toBe(0);
    expect(body.unreadNotifications).toBe(1);
    expect(body.sections.map((s: { title: string }) => s.title)).toEqual([
      'Ofertas para você',
      'Mais pedidos',
      'Recomendados',
      'Entrega rápida',
    ]);
    expect(body.sections[0].products.map((p: { id: string }) => p.id)).toEqual(['p1', 'p4', 'p7', 'p13']);
  });
});

describe('busca', () => {
  it('sugere produtos, categorias e restaurantes', async () => {
    const res = await call('GET', '/search/suggestions?q=pi');
    expect(res.json().data).toEqual(expect.arrayContaining(['Pizza margherita', 'Pizza pepperoni', 'Pizza']));
    const empty = await call('GET', '/search/suggestions');
    expect(empty.json().data.length).toBeGreaterThan(0);
  });

  it('guarda até 6 pesquisas recentes, sem duplicar e mais recente primeiro', async () => {
    for (const term of ['pizza', 'burger', 'açaí', 'suco', 'lasanha', 'brownie', 'feijoada']) {
      ctx.clock.advance(1);
      await call('POST', '/search/recent', { term });
    }
    ctx.clock.advance(1);
    const res = await call('POST', '/search/recent', { term: 'PIZZA ' });
    expect(res.json().data).toEqual(['pizza', 'feijoada', 'brownie', 'lasanha', 'suco', 'açaí']);

    expect((await call('DELETE', '/search/recent')).statusCode).toBe(204);
    expect((await call('GET', '/search/recent')).json().data).toEqual([]);
  });
});

describe('favoritos', () => {
  it('sincroniza o estado entre lista, detalhe e favoritos (idempotente)', async () => {
    expect((await call('GET', '/favorites')).json().data).toEqual([]);

    await call('PUT', '/favorites/p5');
    const again = await call('PUT', '/favorites/p5');
    expect(again.json()).toEqual({ productId: 'p5', isFavorite: true });

    expect((await call('GET', '/products/p5')).json().isFavorite).toBe(true);
    const list = (await call('GET', '/products?category=sobremesas')).json().data;
    expect(list.find((p: { id: string }) => p.id === 'p5').isFavorite).toBe(true);
    expect(ids(await call('GET', '/favorites'))).toEqual(['p5']);

    await call('DELETE', '/favorites/p5');
    expect((await call('GET', '/favorites')).json().data).toEqual([]);
    expect((await call('GET', '/products/p5')).json().isFavorite).toBe(false);
  });

  it('favoritos são por usuário', async () => {
    await call('PUT', '/favorites/p1');
    const other = await registerUser(ctx.app);
    const res = await ctx.app.inject({ method: 'GET', url: '/favorites', headers: other.authHeader });
    expect(res.json().data).toEqual([]);
  });

  it('404 para produto inexistente', async () => {
    expect((await call('PUT', '/favorites/nao-existe')).statusCode).toBe(404);
  });
});
