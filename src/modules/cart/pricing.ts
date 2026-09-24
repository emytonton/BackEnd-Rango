/**
 * Regras de preço do protótipo, isoladas como funções puras (centavos):
 *  - preço unitário = preço do produto + soma dos adicionais;
 *  - entrega grátis a partir de FREE_DELIVERY_THRESHOLD; carrinho vazio não paga entrega;
 *  - cupom aplica percentual sobre o subtotal (antes da entrega).
 */
export interface PricingRules {
  deliveryFeeCents: number;
  freeDeliveryThresholdCents: number;
}

export interface CouponRule {
  percentOff: number;
  minSubtotalCents: number;
}

export interface Totals {
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
}

export function unitPriceCents(productPriceCents: number, addonPricesCents: number[]): number {
  return productPriceCents + addonPricesCents.reduce((sum, p) => sum + p, 0);
}

/** Chave canônica dos adicionais: ids únicos, ordenados, separados por vírgula. */
export function addonKey(addonIds: readonly string[]): string {
  return [...new Set(addonIds)].sort().join(',');
}

export function parseAddonKey(key: string): string[] {
  return key ? key.split(',') : [];
}

export function couponApplies(coupon: CouponRule | null | undefined, subtotalCents: number): boolean {
  return !!coupon && subtotalCents > 0 && subtotalCents >= coupon.minSubtotalCents;
}

export function computeTotals(
  subtotalCents: number,
  rules: PricingRules,
  coupon?: CouponRule | null,
): Totals {
  const deliveryFeeCents =
    subtotalCents === 0 || subtotalCents >= rules.freeDeliveryThresholdCents ? 0 : rules.deliveryFeeCents;
  const discountCents = couponApplies(coupon, subtotalCents)
    ? Math.round((subtotalCents * coupon!.percentOff) / 100)
    : 0;
  return {
    subtotalCents,
    deliveryFeeCents,
    discountCents,
    totalCents: subtotalCents + deliveryFeeCents - discountCents,
  };
}
