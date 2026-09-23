export interface FieldError {
  field: string;
  message: string;
}

/**
 * Erro de domínio com status HTTP e código estável. O frontend deve se basear
 * em `code` (não em `message`) para decidir o comportamento da tela.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message: string, code = 'NOT_FOUND') => new AppError(404, code, message);
export const unauthorized = (message = 'Autenticação necessária.', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const conflict = (code: string, message: string, details?: FieldError[]) =>
  new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: FieldError[]) =>
  new AppError(422, code, message, details);
export const badRequest = (code: string, message: string, details?: FieldError[]) =>
  new AppError(400, code, message, details);
