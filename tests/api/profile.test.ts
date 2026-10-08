import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, createTestApp, multipartBody, PNG_1PX, registerUser, type TestContext } from '../helpers';

let ctx: TestContext;
let call: ReturnType<typeof api>;
let auth: Record<string, string>;

beforeEach(async () => {
  ctx = await createTestApp();
  const u = await registerUser(ctx.app, { email: 'perfil@email.com' });
  auth = u.authHeader;
  call = api(ctx.app, auth);
});
afterEach(async () => {
  await ctx.close();
});

describe('perfil', () => {
  it('lê e edita o perfil', async () => {
    expect((await call('GET', '/me')).json()).toMatchObject({ email: 'perfil@email.com', avatarUrl: null });
    const res = await call('PATCH', '/me', { name: 'Ana Souza', phone: '(21) 99999-0000' });
    expect(res.json()).toMatchObject({ name: 'Ana Souza', phone: '(21) 99999-0000' });
  });

  it('valida campos e e-mail duplicado', async () => {
    expect((await call('PATCH', '/me', {})).statusCode).toBe(400);
    expect((await call('PATCH', '/me', { email: 'ruim' })).json().error.details[0]).toEqual({
      field: 'email',
      message: 'E-mail inválido.',
    });
    await registerUser(ctx.app, { email: 'ocupado@email.com' });
    const res = await call('PATCH', '/me', { email: 'ocupado@email.com' });
    expect(res.statusCode).toBe(409);
  });

  it('envia, serve e remove a foto de perfil', async () => {
    const { payload, headers } = multipartBody('file', 'foto.png', PNG_1PX, 'image/png');
    const res = await ctx.app.inject({ method: 'PUT', url: '/me/avatar', payload, headers: { ...headers, ...auth } });
    expect(res.statusCode).toBe(200);
    const { avatarUrl } = res.json();
    expect(avatarUrl).toMatch(/^\/uploads\/avatars\/\d+-[0-9a-f]+\.png$/);

    const file = await ctx.app.inject({ method: 'GET', url: avatarUrl });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(PNG_1PX)).toBe(true);

    const removed = await call('DELETE', '/me/avatar');
    expect(removed.json().avatarUrl).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.existsSync(path.join(ctx.uploadDir, avatarUrl.replace('/uploads/', '')))).toBe(false);
  });

  it('rejeita arquivo que não é imagem (validação pelo conteúdo)', async () => {
    const { payload, headers } = multipartBody('file', 'foto.png', Buffer.from('não sou uma imagem'), 'image/png');
    const res = await ctx.app.inject({ method: 'PUT', url: '/me/avatar', payload, headers: { ...headers, ...auth } });
    expect(res.statusCode).toBe(415);
    expect(res.json().error.code).toBe('UNSUPPORTED_IMAGE');
  });

  it('rejeita imagem acima de 5 MB', async () => {
    const big = Buffer.concat([PNG_1PX, Buffer.alloc(5 * 1024 * 1024 + 10)]);
    const { payload, headers } = multipartBody('file', 'grande.png', big, 'image/png');
    const res = await ctx.app.inject({ method: 'PUT', url: '/me/avatar', payload, headers: { ...headers, ...auth } });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('FILE_TOO_LARGE');
  });

  it('exige multipart', async () => {
    const res = await call('PUT', '/me/avatar', { file: 'x' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});

describe('configurações', () => {
  it('lê e atualiza tema e notificações parcialmente', async () => {
    expect((await call('GET', '/me/settings')).json()).toEqual({
      theme: 'light',
      notifications: { orders: true, promos: true, news: false },
    });
    const res = await call('PATCH', '/me/settings', { theme: 'dark', notifications: { news: true } });
    expect(res.json()).toEqual({ theme: 'dark', notifications: { orders: true, promos: true, news: true } });
    expect((await call('PATCH', '/me/settings', { theme: 'azul' })).statusCode).toBe(400);
  });
});

describe('endereços', () => {
  const casa = { label: 'Casa', cep: '05422-030', street: 'Rua das Palmeiras, 128', complement: 'apto 42', neighborhood: 'Pinheiros', city: 'São Paulo' };
  const trabalho = { label: 'Trabalho', cep: '04538133', street: 'Av. Faria Lima, 3400', neighborhood: 'Itaim Bibi', city: 'São Paulo' };

  it('o primeiro endereço é selecionado automaticamente; seleção é exclusiva', async () => {
    const a = (await call('POST', '/addresses', casa)).json();
    expect(a).toMatchObject({ isSelected: true, cep: '05422-030', line: 'Rua das Palmeiras, 128 · apto 42' });

    const b = (await call('POST', '/addresses', trabalho)).json();
    expect(b).toMatchObject({ isSelected: false, cep: '04538-133', complement: null, line: 'Av. Faria Lima, 3400' });

    await call('POST', `/addresses/${b.id}/select`);
    const list = (await call('GET', '/addresses')).json().data;
    expect(list.map((x: { id: number; isSelected: boolean }) => [x.id, x.isSelected])).toEqual([
      [b.id, true],
      [a.id, false],
    ]);
    expect((await call('GET', '/home')).json().selectedAddress.id).toBe(b.id);
  });

  it('edita, valida e remove (reelegendo o selecionado)', async () => {
    const a = (await call('POST', '/addresses', casa)).json();
    const b = (await call('POST', '/addresses', { ...trabalho, select: true })).json();

    const edited = await call('PATCH', `/addresses/${a.id}`, { complement: '', label: 'Apê' });
    expect(edited.json()).toMatchObject({ label: 'Apê', complement: null });

    const invalid = await call('POST', '/addresses', { ...casa, cep: '123' });
    expect(invalid.json().error.details[0]).toEqual({ field: 'cep', message: 'CEP inválido.' });

    expect((await call('DELETE', `/addresses/${b.id}`)).statusCode).toBe(204);
    expect((await call('GET', '/addresses')).json().data[0]).toMatchObject({ id: a.id, isSelected: true });
    expect((await call('DELETE', `/addresses/${b.id}`)).statusCode).toBe(404);
  });
});

describe('formas de pagamento', () => {
  it('cadastra cartão guardando só bandeira e 4 dígitos', async () => {
    const res = await call('POST', '/payment-methods', { type: 'credit', brand: 'Visa', last4: '4410' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ type: 'credit', label: 'Cartão de crédito', detail: 'Visa •••• 4410' });

    const bad = await call('POST', '/payment-methods', { type: 'debit', brand: 'Nubank', last4: '12345' });
    expect(bad.statusCode).toBe(400);
  });

  it('PIX e dinheiro são únicos; remoção funciona', async () => {
    expect((await call('POST', '/payment-methods', { type: 'pix' })).statusCode).toBe(409);
    const list = (await call('GET', '/payment-methods')).json().data;
    expect(list.map((m: { detail: string }) => m.detail)).toEqual(['Aprovação imediata', 'Pagamento na entrega']);
    expect((await call('DELETE', `/payment-methods/${list[0].id}`)).statusCode).toBe(204);
    expect((await call('POST', '/payment-methods', { type: 'pix' })).statusCode).toBe(201);
  });
});
