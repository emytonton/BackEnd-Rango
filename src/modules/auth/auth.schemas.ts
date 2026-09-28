import { z } from 'zod';
import { emailField, nameField, passwordField, phoneField, userDto } from '../users/user.schemas';

export const registerBody = z
  .object({
    name: nameField,
    email: emailField,
    phone: phoneField,
    password: passwordField,
    passwordConfirmation: z.string({ error: 'As senhas não coincidem.' }),
    acceptTerms: z.literal(true, { error: 'Aceite os termos para continuar.' }),
    keepSignedIn: z.boolean().default(true),
  })
  .refine((b) => b.password === b.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'As senhas não coincidem.',
  });

export const loginBody = z.object({
  email: emailField,
  password: z.string({ error: 'Informe sua senha.' }).min(1, 'Informe sua senha.'),
  keepSignedIn: z.boolean().default(true).describe('"Manter conectado": refresh token de 30 dias (senão, 1 dia)'),
});

export const refreshBody = z.object({ refreshToken: z.string().min(1) });

export const forgotPasswordBody = z.object({ email: emailField });

export const resetPasswordBody = z
  .object({
    token: z.string().min(1, 'Link de redefinição inválido.'),
    password: passwordField,
    passwordConfirmation: z.string(),
  })
  .refine((b) => b.password === b.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'As senhas não coincidem.',
  });

export const authTokensDto = z.object({
  accessToken: z.string().describe('JWT. Enviar em Authorization: Bearer <token>'),
  accessTokenExpiresAt: z.string(),
  refreshToken: z.string().describe('Token opaco. Guardar em armazenamento seguro (Keychain/Keystore)'),
  refreshTokenExpiresAt: z.string(),
  tokenType: z.literal('Bearer'),
});

export const authResponse = authTokensDto.extend({ user: userDto });

export const forgotPasswordResponse = z.object({
  message: z.string(),
  resetToken: z
    .string()
    .optional()
    .describe('Somente em desenvolvimento (EXPOSE_RESET_TOKEN=true): substitui o link que seria enviado por e-mail'),
});

export const messageResponse = z.object({ message: z.string() });
