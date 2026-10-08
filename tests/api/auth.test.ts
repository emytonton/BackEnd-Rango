import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestContext } from '../helpers';

let ctx: TestContext;
beforeEach(async () => {
  ctx = await createTestApp();
});
afterEach(async () => {
  await ctx.close();
});

const post = (url: string, payload: unknown) => ctx.app.inject({ method: 'POST', url, payload: payload as object });

describe('POST /auth/register', () => {
  it('cria a conta, inicia sessão e prepara pagamentos padrão e notificação de boas-vindas', async () => {
    const user = await registerUser(ctx.app, { email: 'Nova@Email.com' });
    expect(user.user).toMatchObject({ name: 'Ana Teste', email: 'nova@email.com', avatarUrl: null });
    expect(user.tokenType).toBe('Bearer');
    expect(user.refreshToken).toBeTruthy();

    const methods = await ctx.app.inject({ method: 'GET', url: '/payment-methods', headers: user.authHeader });
    expect(methods.json().data.map((m: { type: string }) => m.type)).toEqual(['pix', 'cash']);

    const notifs = await ctx.app.inject({ method: 'GET', url: '/notifications', headers: user.authHeader });
    expect(notifs.json().unreadCount).toBe(1);
    expect(notifs.json().data[0].kind).toBe('promo');
  });

  it('valida campos com as mensagens do protótipo', async () => {
    const res = await post('/auth/register', {
      name: 'Al',
      email: 'invalido',
      phone: '1199',
      password: '123',
      passwordConfirmation: '456',
      acceptTerms: false,
    });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    const byField = Object.fromEntries(error.details.map((d: { field: string; message: string }) => [d.field, d.message]));
    expect(byField).toMatchObject({
      name: 'Informe seu nome completo.',
      email: 'E-mail inválido.',
      phone: 'Telefone incompleto.',
      password: 'Mínimo de 6 caracteres.',
      acceptTerms: 'Aceite os termos para continuar.',
    });
  });

  it('exige que a confirmação de senha coincida', async () => {
    const res = await post('/auth/register', {
      name: 'Ana Teste',
      email: 'ana@email.com',
      phone: '11912345678',
      password: 'segredo1',
      passwordConfirmation: 'segredo2',
      acceptTerms: true,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details).toContainEqual({ field: 'passwordConfirmation', message: 'As senhas não coincidem.' });
  });

  it('recusa e-mail já cadastrado (sem diferenciar maiúsculas)', async () => {
    await registerUser(ctx.app, { email: 'dup@email.com' });
    const res = await post('/auth/register', {
      name: 'Outra Pessoa',
      email: 'DUP@email.com',
      phone: '11912345678',
      password: 'segredo1',
      passwordConfirmation: 'segredo1',
      acceptTerms: true,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EMAIL_IN_USE');
  });
});

describe('POST /auth/login', () => {
  it('autentica com credenciais corretas', async () => {
    const u = await registerUser(ctx.app);
    const res = await post('/auth/login', { email: u.email, password: u.password });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(u.email);
  });

  it('responde 401 genérico para senha incorreta ou e-mail inexistente', async () => {
    const u = await registerUser(ctx.app);
    for (const payload of [
      { email: u.email, password: 'errada' },
      { email: 'naoexiste@email.com', password: 'qualquer' },
    ]) {
      const res = await post('/auth/login', payload);
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' });
    }
  });

  it('valida campos vazios e e-mail inválido', async () => {
    const res = await post('/auth/login', { email: 'x', password: '' });
    expect(res.statusCode).toBe(400);
    const fields = res.json().error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
  });
});

describe('sessão (refresh / logout)', () => {
  it('rotaciona o refresh token e detecta reuso', async () => {
    const u = await registerUser(ctx.app);
    const first = await post('/auth/refresh', { refreshToken: u.refreshToken });
    expect(first.statusCode).toBe(200);
    const rotated = first.json().refreshToken;
    expect(rotated).not.toBe(u.refreshToken);

    // reuso do token antigo → 401 e revogação de todas as sessões
    const reuse = await post('/auth/refresh', { refreshToken: u.refreshToken });
    expect(reuse.statusCode).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: rotated })).statusCode).toBe(401);
  });

  it('respeita "Manter conectado" na validade do refresh token', async () => {
    const u = await registerUser(ctx.app);
    const short = (await post('/auth/login', { email: u.email, password: u.password, keepSignedIn: false })).json();
    const long = (await post('/auth/login', { email: u.email, password: u.password, keepSignedIn: true })).json();
    const now = ctx.clock.now().getTime();
    const days = (iso: string) => Math.round((new Date(iso).getTime() - now) / 86_400_000);
    expect(days(short.refreshTokenExpiresAt)).toBe(1);
    expect(days(long.refreshTokenExpiresAt)).toBe(30);

    ctx.clock.advance(2 * 86_400);
    const expired = await post('/auth/refresh', { refreshToken: short.refreshToken });
    expect(expired.json().error.code).toBe('SESSION_EXPIRED');
    expect((await post('/auth/refresh', { refreshToken: long.refreshToken })).statusCode).toBe(200);
  });

  it('logout revoga o refresh token', async () => {
    const u = await registerUser(ctx.app);
    expect((await post('/auth/logout', { refreshToken: u.refreshToken })).statusCode).toBe(204);
    expect((await post('/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);
  });
});

describe('recuperação de senha', () => {
  it('fluxo completo: solicitar → redefinir → entrar com a nova senha', async () => {
    const u = await registerUser(ctx.app);
    const forgot = await post('/auth/forgot-password', { email: u.email });
    expect(forgot.statusCode).toBe(202);
    const { resetToken } = forgot.json();
    expect(resetToken).toBeTruthy();

    const reset = await post('/auth/reset-password', {
      token: resetToken,
      password: 'novaSenha9',
      passwordConfirmation: 'novaSenha9',
    });
    expect(reset.statusCode).toBe(200);

    expect((await post('/auth/login', { email: u.email, password: u.password })).statusCode).toBe(401);
    expect((await post('/auth/login', { email: u.email, password: 'novaSenha9' })).statusCode).toBe(200);
    // sessões antigas encerradas e token de uso único
    expect((await post('/auth/refresh', { refreshToken: u.refreshToken })).statusCode).toBe(401);
    const again = await post('/auth/reset-password', { token: resetToken, password: 'outra123', passwordConfirmation: 'outra123' });
    expect(again.json().error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('não revela se o e-mail existe', async () => {
    const res = await post('/auth/forgot-password', { email: 'ninguem@email.com' });
    expect(res.statusCode).toBe(202);
    expect(res.json().resetToken).toBeUndefined();
  });

  it('token expira em 30 minutos', async () => {
    const u = await registerUser(ctx.app);
    const { resetToken } = (await post('/auth/forgot-password', { email: u.email })).json();
    ctx.clock.advance(31 * 60);
    const res = await post('/auth/reset-password', { token: resetToken, password: 'novaSenha9', passwordConfirmation: 'novaSenha9' });
    expect(res.statusCode).toBe(400);
  });

  it('não expõe o token em produção', async () => {
    const prod = await createTestApp({ NODE_ENV: 'production', JWT_SECRET: 'a-real-production-secret-123' });
    try {
      const u = await registerUser(prod.app);
      const res = await prod.app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email: u.email } });
      expect(res.json().resetToken).toBeUndefined();
    } finally {
      await prod.close();
    }
  });
});

describe('rotas protegidas', () => {
  it('exigem token', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rejeitam token adulterado', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(res.json().error.code).toBe('INVALID_TOKEN');
  });

  it('health e rota inexistente', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/health' })).json().status).toBe('ok');
    const nf = await ctx.app.inject({ method: 'GET', url: '/nao-existe' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).toBe('ROUTE_NOT_FOUND');
  });
});
