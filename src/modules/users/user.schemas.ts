import { z } from 'zod';
import { onlyDigits } from '../../lib/text';
import type { UserRow } from './user.repository';

// Regras e mensagens espelham as validações do protótipo (tela de cadastro).
export const nameField = z
  .string({ error: 'Informe seu nome completo.' })
  .trim()
  .min(3, 'Informe seu nome completo.')
  .max(120, 'Nome muito longo.');

export const emailField = z
  .string({ error: 'Informe seu e-mail.' })
  .trim()
  .toLowerCase()
  .min(1, 'Informe seu e-mail.')
  .max(254, 'E-mail inválido.')
  .regex(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, 'E-mail inválido.');

export const phoneField = z
  .string({ error: 'Informe seu telefone.' })
  .trim()
  .refine((v) => {
    const d = onlyDigits(v).length;
    return d >= 10 && d <= 11;
  }, 'Telefone incompleto.')
  .describe('Aceita máscara, ex.: (11) 98876-4410');

export const passwordField = z
  .string({ error: 'Informe sua senha.' })
  .min(6, 'Mínimo de 6 caracteres.')
  .max(72, 'Máximo de 72 caracteres.');

export const themeField = z.enum(['light', 'dark', 'system']);

export const userDto = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  avatarUrl: z.string().nullable().describe('Caminho relativo à base da API, ex.: /uploads/avatars/1-ab12.jpg'),
  createdAt: z.string(),
});

export const settingsDto = z.object({
  theme: themeField,
  notifications: z.object({
    orders: z.boolean(),
    promos: z.boolean(),
    news: z.boolean(),
  }),
});

export function toUserDto(u: UserRow): z.infer<typeof userDto> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatarUrl: u.avatar_path ? `/uploads/${u.avatar_path}` : null,
    createdAt: u.created_at,
  };
}

export function toSettingsDto(u: UserRow): z.infer<typeof settingsDto> {
  return {
    theme: u.theme,
    notifications: { orders: !!u.notify_orders, promos: !!u.notify_promos, news: !!u.notify_news },
  };
}
