import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp, type BuiltApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDatabase } from '../src/db/connection';
import { seedDemoUser } from '../src/db/seed';
import { DEMO_USER } from '../src/db/seed-data';
import type { Clock } from '../src/lib/clock';

export class TestClock implements Clock {
  private current: Date;
  constructor(start = '2026-09-21T15:00:00.000Z') {
    this.current = new Date(start);
  }
  now() {
    return new Date(this.current);
  }
  advance(seconds: number) {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

export interface TestContext extends BuiltApp {
  clock: TestClock;
  uploadDir: string;
  close(): Promise<void>;
}

/** App completo com SQLite em memória, relógio controlável e bcrypt rápido. */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rango-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    UPLOAD_DIR: uploadDir,
    BCRYPT_ROUNDS: '4',
    ORDER_STEP_SECONDS: '10',
    JWT_SECRET: 'test-secret-with-enough-length',
    ...env,
  });
  const clock = new TestClock();
  const db = openDatabase(':memory:');
  const built = await buildApp({ config, db, clock, logger: false });
  await built.app.ready();
  return {
    ...built,
    clock,
    uploadDir,
    async close() {
      await built.app.close();
      db.close();
      fs.rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

let counter = 0;

export async function registerUser(app: FastifyInstance, overrides: Record<string, unknown> = {}) {
  counter += 1;
  const body = {
    name: 'Ana Teste',
    email: `ana${counter}@email.com`,
    phone: '(11) 91234-5678',
    password: 'segredo1',
    passwordConfirmation: 'segredo1',
    acceptTerms: true,
    ...overrides,
  };
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: body });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  const json = res.json();
  return { ...json, authHeader: { authorization: `Bearer ${json.accessToken}` }, email: body.email, password: body.password };
}

export async function loginDemo(ctx: TestContext) {
  seedDemoUser(ctx.db, ctx.config, ctx.clock);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: DEMO_USER.email, password: DEMO_USER.password },
  });
  const json = res.json();
  return { ...json, authHeader: { authorization: `Bearer ${json.accessToken}` } };
}

/** Atalho para requisições autenticadas. */
export function api(app: FastifyInstance, headers: Record<string, string>) {
  return (method: InjectOptions['method'], url: string, payload?: unknown) =>
    app.inject({ method, url, headers, ...(payload !== undefined ? { payload: payload as InjectOptions['payload'] } : {}) });
}

/** Monta um corpo multipart/form-data com um único arquivo. */
export function multipartBody(field: string, filename: string, content: Buffer, contentType: string) {
  const boundary = '----rangotest' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { payload: Buffer.concat([head, content, tail]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
