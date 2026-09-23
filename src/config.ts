import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/rango.db'),
  UPLOAD_DIR: z.string().default('./uploads'),
  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().positive().default(1),
  REFRESH_TTL_DAYS_KEEP_SIGNED_IN: z.coerce.number().positive().default(30),
  CORS_ORIGINS: z.string().default('*'),
  DELIVERY_FEE: z.coerce.number().min(0).default(7.9),
  FREE_DELIVERY_THRESHOLD: z.coerce.number().min(0).default(60),
  ORDER_STEP_SECONDS: z.coerce.number().min(0).default(20),
  EXPOSE_RESET_TOKEN: bool.default(true),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  SEED_DEMO_DATA: bool.optional(),
  LOG_LEVEL: z.string().default('info'),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databasePath: string;
  uploadDir: string;
  jwtSecret: string;
  accessTokenTtl: string;
  refreshTtlDays: number;
  refreshTtlDaysKeepSignedIn: number;
  corsOrigins: string[] | '*';
  deliveryFeeCents: number;
  freeDeliveryThresholdCents: number;
  orderStepSeconds: number;
  exposeResetToken: boolean;
  bcryptRounds: number;
  /** Cria o usuário de demonstração na inicialização (padrão: só em development). */
  seedDemoData: boolean;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${issues}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production' && e.JWT_SECRET === 'dev-only-secret-change-me') {
    throw new Error('Defina JWT_SECRET ao executar com NODE_ENV=production.');
  }
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    databasePath: e.DATABASE_PATH,
    uploadDir: e.UPLOAD_DIR,
    jwtSecret: e.JWT_SECRET,
    accessTokenTtl: e.ACCESS_TOKEN_TTL,
    refreshTtlDays: e.REFRESH_TTL_DAYS,
    refreshTtlDaysKeepSignedIn: e.REFRESH_TTL_DAYS_KEEP_SIGNED_IN,
    corsOrigins: e.CORS_ORIGINS.trim() === '*' ? '*' : e.CORS_ORIGINS.split(',').map((o) => o.trim()),
    deliveryFeeCents: Math.round(e.DELIVERY_FEE * 100),
    freeDeliveryThresholdCents: Math.round(e.FREE_DELIVERY_THRESHOLD * 100),
    orderStepSeconds: e.ORDER_STEP_SECONDS,
    // Nunca devolve o token de redefinição em produção, independentemente da variável.
    exposeResetToken: e.EXPOSE_RESET_TOKEN && e.NODE_ENV !== 'production',
    bcryptRounds: e.BCRYPT_ROUNDS,
    seedDemoData: e.SEED_DEMO_DATA ?? e.NODE_ENV === 'development',
    logLevel: e.LOG_LEVEL,
  };
}
