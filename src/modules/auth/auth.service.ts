import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { AppConfig } from '../../config';
import type { DB } from '../../db/connection';
import type { Clock } from '../../lib/clock';
import { AppError, conflict, unauthorized } from '../../lib/errors';
import type { NotificationService } from '../notifications/notification.service';
import type { PaymentMethodRepository } from '../payment-methods/payment-method.repository';
import type { UserRepository, UserRow } from '../users/user.repository';
import { toUserDto } from '../users/user.schemas';
import type { SessionRepository } from './session.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export type AccessTokenIssuer = (userId: number) => { token: string; expiresAt: Date };

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  keepSignedIn: boolean;
}

export class AuthService {
  // hash usado quando o e-mail não existe, para o tempo de resposta não revelar contas cadastradas
  private readonly dummyHash: string;

  constructor(
    private readonly db: DB,
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly paymentMethods: PaymentMethodRepository,
    private readonly notifications: NotificationService,
    private readonly issueAccessToken: AccessTokenIssuer,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {
    this.dummyHash = bcrypt.hashSync('not-a-real-password', config.bcryptRounds);
  }

  async register(input: RegisterInput) {
    if (this.users.emailTaken(input.email)) {
      throw conflict('EMAIL_IN_USE', 'Este e-mail já está cadastrado.', [
        { field: 'email', message: 'Este e-mail já está cadastrado.' },
      ]);
    }
    const passwordHash = await bcrypt.hash(input.password, this.config.bcryptRounds);
    const now = this.clock.now().toISOString();

    const user = this.db.transaction(() => {
      const created = this.users.create({ ...input, passwordHash, now });
      // formas de pagamento que não exigem cadastro de dados
      this.paymentMethods.create(created.id, { type: 'pix' }, now);
      this.paymentMethods.create(created.id, { type: 'cash' }, now);
      this.notifications.notify({
        userId: created.id,
        kind: 'promo',
        title: 'Tem promoção nova esperando por você',
        body: 'Use o cupom RANGO10 e ganhe 10% de desconto no seu pedido.',
        createdAt: now,
      });
      return created;
    })();

    return { ...this.startSession(user.id, input.keepSignedIn), user: toUserDto(user) };
  }

  async login(email: string, password: string, keepSignedIn: boolean) {
    const user = this.users.findByEmail(email);
    const ok = await bcrypt.compare(password, user?.password_hash ?? this.dummyHash);
    if (!user || !ok) {
      throw unauthorized('E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
    }
    return { ...this.startSession(user.id, keepSignedIn), user: toUserDto(user) };
  }

  /** Rotaciona o refresh token. Reuso de token já rotacionado revoga todas as sessões do usuário. */
  refresh(refreshToken: string) {
    const session = this.sessions.findByHash(hashToken(refreshToken));
    const now = this.clock.now();
    if (!session) throw unauthorized('Sessão inválida. Entre novamente.', 'INVALID_REFRESH_TOKEN');
    if (session.revoked_at) {
      this.sessions.revokeAllForUser(session.user_id, now.toISOString());
      throw unauthorized('Sessão inválida. Entre novamente.', 'INVALID_REFRESH_TOKEN');
    }
    if (new Date(session.expires_at) <= now) {
      throw unauthorized('Sua sessão expirou. Entre novamente.', 'SESSION_EXPIRED');
    }
    const user = this.users.findById(session.user_id);
    if (!user) throw unauthorized('Sessão inválida. Entre novamente.', 'INVALID_REFRESH_TOKEN');

    return this.db.transaction(() => {
      this.sessions.revoke(session.id, now.toISOString());
      return { ...this.startSession(user.id, !!session.keep_signed_in), user: toUserDto(user) };
    })();
  }

  logout(refreshToken: string): void {
    const session = this.sessions.findByHash(hashToken(refreshToken));
    if (session) this.sessions.revoke(session.id, this.clock.now().toISOString());
  }

  /**
   * Sempre responde com sucesso (não revela se o e-mail existe). Sem serviço de e-mail,
   * o token é registrado no log e, em desenvolvimento, devolvido na resposta.
   */
  forgotPassword(email: string): { token: string | null; user: UserRow | null } {
    const user = this.users.findByEmail(email);
    if (!user) return { token: null, user: null };
    const token = randomToken();
    const now = this.clock.now();
    this.sessions.createPasswordReset(
      user.id,
      hashToken(token),
      new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString(),
      now.toISOString(),
    );
    return { token, user };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const reset = this.sessions.findPasswordReset(hashToken(token));
    const now = this.clock.now();
    if (!reset || reset.used_at || new Date(reset.expires_at) <= now) {
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'Link de redefinição inválido ou expirado.');
    }
    const passwordHash = await bcrypt.hash(password, this.config.bcryptRounds);
    this.db.transaction(() => {
      this.users.updatePassword(reset.user_id, passwordHash, now.toISOString());
      this.sessions.markPasswordResetUsed(reset.id, now.toISOString());
      this.sessions.revokeAllForUser(reset.user_id, now.toISOString());
    })();
  }

  private startSession(userId: number, keepSignedIn: boolean) {
    const now = this.clock.now();
    const days = keepSignedIn ? this.config.refreshTtlDaysKeepSignedIn : this.config.refreshTtlDays;
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(now.getTime() + days * DAY_MS).toISOString();
    this.sessions.create(userId, hashToken(refreshToken), keepSignedIn, refreshExpiresAt, now.toISOString());
    const access = this.issueAccessToken(userId);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt,
      tokenType: 'Bearer' as const,
    };
  }
}
