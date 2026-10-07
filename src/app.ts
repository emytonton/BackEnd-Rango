import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { type AppConfig, loadConfig } from './config';
import { createServices, type Services } from './container';
import { type DB, openDatabase } from './db/connection';
import { runMigrations } from './db/migrate';
import { seedCatalog, seedDemoUser } from './db/seed';
import { type Clock, systemClock } from './lib/clock';
import { addressRoutes } from './modules/addresses/address.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { cartRoutes } from './modules/cart/cart.routes';
import { catalogRoutes } from './modules/catalog/catalog.routes';
import { homeRoutes } from './modules/home/home.routes';
import { notificationRoutes } from './modules/notifications/notification.routes';
import { orderRoutes } from './modules/orders/order.routes';
import { paymentMethodRoutes } from './modules/payment-methods/payment-method.routes';
import { profileRoutes } from './modules/users/profile.routes';
import { AVATAR_MAX_BYTES } from './modules/users/profile.service';
import { createAuthenticate } from './plugins/authenticate';
import { registerErrorHandling } from './plugins/error-handler';

// mensagens de validação padrão do Zod em português
z.config(z.locales.pt());

export interface BuildAppOptions {
  config?: AppConfig;
  db?: DB;
  clock?: Clock;
  logger?: boolean;
}

export interface BuiltApp {
  app: FastifyInstance;
  db: DB;
  services: Services;
  config: AppConfig;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<BuiltApp> {
  const config = options.config ?? loadConfig();
  const clock = options.clock ?? systemClock;
  const db = options.db ?? openDatabase(config.databasePath);

  runMigrations(db);
  seedCatalog(db);
  if (config.seedDemoData) seedDemoUser(db, config, clock);

  const app = Fastify({
    logger: (options.logger ?? config.env !== 'test') ? { level: config.logLevel } : false,
    routerOptions: { ignoreTrailingSlash: true },
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  await app.register(cors, {
    origin: config.corsOrigins === '*' ? true : config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.accessTokenTtl },
    formatUser: (payload) => ({ id: Number(payload.sub) }),
  });
  await app.register(multipart, { limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 5 } });

  fs.mkdirSync(path.resolve(config.uploadDir), { recursive: true });
  await app.register(fastifyStatic, { root: path.resolve(config.uploadDir), prefix: '/uploads/', decorateReply: false });

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Rango API',
        version: '0.1.0',
        description:
          'Backend do protótipo mobile de delivery Rango. Valores monetários em reais (number). ' +
          'Datas em ISO-8601 UTC. Erros: `{ "error": { "code", "message", "details?" } }`.',
      },
      servers: [{ url: `http://localhost:${config.port}` }],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  const issueAccessToken = (userId: number) => {
    const token = app.jwt.sign({ sub: String(userId) });
    const { exp } = app.jwt.decode<{ exp: number }>(token)!;
    return { token, expiresAt: new Date(exp * 1000) };
  };
  const services = createServices(db, config, clock, issueAccessToken);

  app.get(
    '/health',
    {
      schema: {
        tags: ['Infra'],
        summary: 'Verificação de saúde (API + banco)',
        response: { 200: z.object({ status: z.literal('ok'), database: z.literal('ok'), time: z.string() }) },
      },
    },
    async () => {
      db.prepare('SELECT 1').get();
      return { status: 'ok' as const, database: 'ok' as const, time: clock.now().toISOString() };
    },
  );

  await app.register(authRoutes, { services, config });

  // Todas as demais rotas exigem Authorization: Bearer <accessToken>
  await app.register(async (protectedScope) => {
    protectedScope.addHook('onRequest', createAuthenticate(services.users));
    for (const routes of [
      profileRoutes,
      addressRoutes,
      paymentMethodRoutes,
      homeRoutes,
      catalogRoutes,
      cartRoutes,
      orderRoutes,
      notificationRoutes,
    ]) {
      await protectedScope.register(routes, { services });
    }
  });

  app.addHook('onClose', async () => {
    if (!options.db) db.close();
  });

  return { app, db, services, config };
}
