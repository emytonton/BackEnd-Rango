/** Valores são armazenados em centavos (inteiros) e expostos na API em reais (number com 2 casas). */
export const toReais = (cents: number): number => Math.round(cents) / 100;
export const toCents = (reais: number): number => Math.round(reais * 100);

export function formatBRL(cents: number): string {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
}
