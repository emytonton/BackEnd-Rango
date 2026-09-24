import { describe, expect, it } from 'vitest';
import {
  formatOrderCode,
  parseOrderCode,
  pendingAdvances,
  statusLabel,
} from '../../src/modules/orders/order-status';

const t0 = new Date('2026-09-21T12:00:00Z');
const after = (s: number) => new Date(t0.getTime() + s * 1000);

describe('order status machine', () => {
  it('não avança antes do intervalo', () => {
    expect(pendingAdvances(1, t0, after(9), 10)).toEqual([]);
  });

  it('avança uma etapa por intervalo, com o horário exato de cada etapa', () => {
    expect(pendingAdvances(1, t0, after(25), 10)).toEqual([
      { step: 2, at: after(10) },
      { step: 3, at: after(20) },
    ]);
  });

  it('para na última etapa (Entregue)', () => {
    const steps = pendingAdvances(1, t0, after(3600), 10).map((a) => a.step);
    expect(steps).toEqual([2, 3, 4]);
  });

  it('fica desligado com intervalo 0', () => {
    expect(pendingAdvances(1, t0, after(3600), 0)).toEqual([]);
  });

  it('rótulos de status', () => {
    expect(statusLabel('live', 2)).toBe('Em preparação');
    expect(statusLabel('done', 4)).toBe('Entregue');
    expect(statusLabel('cancel', 1)).toBe('Cancelado');
  });

  it('formata e interpreta o número do pedido', () => {
    expect(formatOrderCode(10482)).toBe('RG-10482');
    expect(parseOrderCode('RG-10482')).toBe(10482);
    expect(parseOrderCode('rg-10482')).toBe(10482);
    expect(parseOrderCode('10482')).toBe(10482);
    expect(parseOrderCode('abc')).toBeNull();
  });
});
