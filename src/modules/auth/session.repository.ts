import type { DB } from '../../db/connection';

export interface SessionRow {
  id: number;
  user_id: number;
  token_hash: string;
  keep_signed_in: 0 | 1;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
}

export interface PasswordResetRow {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export class SessionRepository {
  constructor(private readonly db: DB) {}

  create(userId: number, tokenHash: string, keepSignedIn: boolean, expiresAt: string, now: string): void {
    this.db
      .prepare(
        `INSERT INTO sessions (user_id, token_hash, keep_signed_in, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(userId, tokenHash, Number(keepSignedIn), expiresAt, now);
  }

  findByHash(tokenHash: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash) as SessionRow | undefined;
  }

  revoke(id: number, now: string): void {
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, id);
  }

  revokeAllForUser(userId: number, now: string): void {
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId);
  }

  createPasswordReset(userId: number, tokenHash: string, expiresAt: string, now: string): void {
    // invalida pedidos anteriores ainda não usados
    this.db
      .prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL')
      .run(now, userId);
    this.db
      .prepare('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, tokenHash, expiresAt, now);
  }

  findPasswordReset(tokenHash: string): PasswordResetRow | undefined {
    return this.db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash) as
      | PasswordResetRow
      | undefined;
  }

  markPasswordResetUsed(id: number, now: string): void {
    this.db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, id);
  }
}
