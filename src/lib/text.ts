/** Minúsculas e sem acentos — mesma normalização usada pela busca do protótipo. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/** Escapa curingas do LIKE (usado com `ESCAPE '\'`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => '\\' + c);
}

export const onlyDigits = (value: string) => value.replace(/\D/g, '');
