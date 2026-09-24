import { describe, expect, it } from 'vitest';
import { addonKey, computeTotals, couponApplies, parseAddonKey, unitPriceCents } from '../../src/modules/cart/pricing';

const rules = { deliveryFeeCents: 790, freeDeliveryThresholdCents: 6000 };

describe('pricing', () => {
  it('soma adicionais ao preço unitário', () => {
    expect(unitPriceCents(3490, [400, 200])).toBe(4090);
    expect(unitPriceCents(3490, [])).toBe(3490);
  });

  it('gera chave canônica de adicionais (ordenada e sem duplicatas)', () => {
    expect(addonKey(['a3', 'a1', 'a3'])).toBe('a1,a3');
    expect(addonKey([])).toBe('');
    expect(parseAddonKey('a1,a3')).toEqual(['a1', 'a3']);
    expect(parseAddonKey('')).toEqual([]);
  });

  it('cobra entrega abaixo do mínimo para frete grátis', () => {
    expect(computeTotals(3490, rules)).toEqual({
      subtotalCents: 3490,
      deliveryFeeCents: 790,
      discountCents: 0,
      totalCents: 4280,
    });
  });

  it('isenta a entrega a partir do mínimo (inclusive) e em carrinho vazio', () => {
    expect(computeTotals(6000, rules).deliveryFeeCents).toBe(0);
    expect(computeTotals(0, rules)).toEqual({ subtotalCents: 0, deliveryFeeCents: 0, discountCents: 0, totalCents: 0 });
  });

  it('aplica cupom percentual sobre o subtotal, com arredondamento em centavos', () => {
    const t = computeTotals(4985, rules, { percentOff: 10, minSubtotalCents: 0 });
    expect(t.discountCents).toBe(499);
    expect(t.totalCents).toBe(4985 + 790 - 499);
  });

  it('não aplica cupom abaixo do subtotal mínimo', () => {
    const coupon = { percentOff: 20, minSubtotalCents: 4000 };
    expect(couponApplies(coupon, 3999)).toBe(false);
    expect(couponApplies(coupon, 4000)).toBe(true);
    expect(computeTotals(3999, rules, coupon).discountCents).toBe(0);
  });
});
