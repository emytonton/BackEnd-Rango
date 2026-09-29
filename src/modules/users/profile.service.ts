import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../../config';
import type { Clock } from '../../lib/clock';
import { AppError, conflict, notFound } from '../../lib/errors';
import type { SettingsPatch, UserRepository } from './user.repository';
import { toSettingsDto, toUserDto } from './user.schemas';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Detecta o formato pelos "magic bytes" — não confia no Content-Type enviado pelo cliente. */
export function detectImageType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export class ProfileService {
  constructor(
    private readonly users: UserRepository,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  get(userId: number) {
    return toUserDto(this.require(userId));
  }

  update(userId: number, fields: { name?: string; email?: string; phone?: string }) {
    this.require(userId);
    if (fields.email && this.users.emailTaken(fields.email, userId)) {
      throw conflict('EMAIL_IN_USE', 'Este e-mail já está cadastrado.', [
        { field: 'email', message: 'Este e-mail já está cadastrado.' },
      ]);
    }
    this.users.updateProfile(userId, fields, this.clock.now().toISOString());
    return this.get(userId);
  }

  /** Recebe a imagem já recortada pelo app (o recorte/zoom acontece no dispositivo). */
  setAvatar(userId: number, data: Buffer) {
    const user = this.require(userId);
    const ext = detectImageType(data);
    if (!ext) throw new AppError(415, 'UNSUPPORTED_IMAGE', 'Envie uma imagem JPG, PNG ou WEBP.');

    const relative = `avatars/${userId}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const absolute = path.join(this.config.uploadDir, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, data);
    this.users.setAvatar(userId, relative, this.clock.now().toISOString());
    this.deleteFile(user.avatar_path);
    return this.get(userId);
  }

  removeAvatar(userId: number) {
    const user = this.require(userId);
    this.users.setAvatar(userId, null, this.clock.now().toISOString());
    this.deleteFile(user.avatar_path);
    return this.get(userId);
  }

  settings(userId: number) {
    return toSettingsDto(this.require(userId));
  }

  updateSettings(userId: number, patch: SettingsPatch) {
    this.require(userId);
    this.users.updateSettings(userId, patch, this.clock.now().toISOString());
    return this.settings(userId);
  }

  private require(userId: number) {
    const user = this.users.findById(userId);
    if (!user) throw notFound('Usuário não encontrado.', 'USER_NOT_FOUND');
    return user;
  }

  private deleteFile(relative: string | null) {
    if (!relative) return;
    fs.rm(path.join(this.config.uploadDir, relative), { force: true }, () => {});
  }
}
