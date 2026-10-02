import type { DB } from '../../db/connection';
import type { AppConfig } from '../../config';
import type { Clock } from '../../lib/clock';
import { AppError, badRequest, notFound, unprocessable } from '../../lib/errors';
import { toReais } from '../../lib/money';
import { normalize } from '../../lib/text';
import type { AddonRow, CatalogRepository, ProductRow } from '../catalog/catalog.repository';
import { toAddonDto } from '../catalog/catalog.schemas';
import type { CartItemRow, CartRepository, CouponRow } from './cart.repository';
import type { CartDto } from './cart.schemas';
import { addonKey, computeTotals, couponApplies, parseAddonKey, type Totals, unitPriceCents } from './pricing';

export const MAX_LINE_QUANTITY = 99;

export interface PricedLine {
  row: CartItemRow;
  product: ProductRow;
  addons: AddonRow[];
  unitPriceCents: number;
  totalCents: number;
}

/** Carrinho calculado em centavos — usado internamente pelo checkout. */
export interface PricedCart {
  lines: PricedLine[];
  coupon: CouponRow | null;
  couponApplied: boolean;
  totals: Totals;
}

export class CartService {
  constructor(
    private readonly db: DB,
    private readonly repo: CartRepository,
    private readonly catalog: CatalogRepository,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  get(userId: number): CartDto {
    return this.toDto(this.price(userId));
  }

  itemCount(userId: number): number {
    return this.repo.listItems(userId).reduce((n, i) => n + i.quantity, 0);
  }

  price(userId: number): PricedCart {
    const rows = this.repo.listItems(userId);
    const products = new Map(this.catalog.findProducts(userId, [...new Set(rows.map((r) => r.product_id))]).map((p) => [p.id, p]));
    const addons = new Map(this.catalog.listAddons().map((a) => [a.id, a]));

    const lines: PricedLine[] = [];
    for (const row of rows) {
      const product = products.get(row.product_id);
      if (!product) continue; // FK com ON DELETE CASCADE: não deveria ocorrer
      const lineAddons = parseAddonKey(row.addon_key)
        .map((id) => addons.get(id))
        .filter((a): a is AddonRow => !!a);
      const unit = unitPriceCents(product.price_cents, lineAddons.map((a) => a.price_cents));
      lines.push({ row, product, addons: lineAddons, unitPriceCents: unit, totalCents: unit * row.quantity });
    }

    const subtotal = lines.filter((l) => l.product.is_available).reduce((s, l) => s + l.totalCents, 0);
    const coupon = this.validCoupon(this.repo.couponCode(userId));
    const rule = coupon ? { percentOff: coupon.percent_off, minSubtotalCents: coupon.min_subtotal_cents } : null;
    return {
      lines,
      coupon,
      couponApplied: couponApplies(rule, subtotal),
      totals: computeTotals(subtotal, this.config, rule),
    };
  }

  /** Mesmo produto com os mesmos adicionais soma na linha existente (regra do protótipo). */
  addItem(userId: number, input: { productId: string; quantity: number; addonIds: string[]; notes: string }) {
    const product = this.catalog.findProduct(userId, input.productId);
    if (!product) throw notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');
    if (!product.is_available) throw unprocessable('PRODUCT_UNAVAILABLE', 'Produto indisponível no momento.');

    const key = addonKey(input.addonIds);
    const ids = key ? key.split(',') : [];
    if (this.catalog.findAddons(ids).length !== ids.length) {
      throw badRequest('INVALID_ADDON', 'Adicional inválido.', [{ field: 'addonIds', message: 'Adicional inválido.' }]);
    }

    const now = this.clock.now().toISOString();
    this.db.transaction(() => {
      const existing = this.repo.findByKey(userId, input.productId, key);
      if (existing) {
        const quantity = existing.quantity + input.quantity;
        if (quantity > MAX_LINE_QUANTITY) throw this.quantityLimit();
        this.repo.updateItem(userId, existing.id, { quantity, notes: input.notes || undefined }, now);
      } else {
        this.repo.insertItem(userId, { productId: input.productId, addonKey: key, quantity: input.quantity, notes: input.notes }, now);
      }
    })();
    return this.get(userId);
  }

  updateItem(userId: number, itemId: number, fields: { quantity?: number; notes?: string }) {
    if (!this.repo.findItem(userId, itemId)) throw notFound('Item do carrinho não encontrado.');
    this.repo.updateItem(userId, itemId, fields, this.clock.now().toISOString());
    return this.get(userId);
  }

  removeItem(userId: number, itemId: number) {
    if (!this.repo.deleteItem(userId, itemId)) throw notFound('Item do carrinho não encontrado.');
    return this.get(userId);
  }

  clear(userId: number) {
    this.repo.clear(userId, this.clock.now().toISOString());
    return this.get(userId);
  }

  applyCoupon(userId: number, rawCode: string) {
    const code = normalize(rawCode).toUpperCase();
    const coupon = this.validCoupon(code);
    if (!coupon) throw unprocessable('INVALID_COUPON', 'Cupom inválido.', [{ field: 'code', message: 'Cupom inválido.' }]);
    const { totals } = this.price(userId);
    if (totals.subtotalCents < coupon.min_subtotal_cents) {
      const min = toReais(coupon.min_subtotal_cents).toFixed(2).replace('.', ',');
      throw unprocessable('COUPON_MIN_SUBTOTAL', `Este cupom vale para pedidos a partir de R$ ${min}.`);
    }
    this.repo.setCoupon(userId, coupon.code, this.clock.now().toISOString());
    return this.get(userId);
  }

  removeCoupon(userId: number) {
    this.repo.setCoupon(userId, null, this.clock.now().toISOString());
    return this.get(userId);
  }

  /**
   * "Pedir novamente": substitui o conteúdo do carrinho pelos itens informados
   * (preços atuais). Produtos indisponíveis/removidos e adicionais extintos são ignorados.
   */
  replaceWith(userId: number, items: { productId: string | null; quantity: number; addonIds: string[]; notes: string }[]) {
    const now = this.clock.now().toISOString();
    const validAddons = new Set(this.catalog.listAddons().map((a) => a.id));
    const skipped: string[] = [];
    this.db.transaction(() => {
      this.repo.clear(userId, now);
      for (const item of items) {
        const product = item.productId ? this.catalog.findProduct(userId, item.productId) : undefined;
        if (!product || !product.is_available) {
          skipped.push(item.productId ?? '');
          continue;
        }
        const key = addonKey(item.addonIds.filter((a) => validAddons.has(a)));
        const existing = this.repo.findByKey(userId, product.id, key);
        if (existing) {
          const quantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + item.quantity);
          this.repo.updateItem(userId, existing.id, { quantity }, now);
        } else {
          this.repo.insertItem(userId, { productId: product.id, addonKey: key, quantity: Math.min(MAX_LINE_QUANTITY, item.quantity), notes: item.notes }, now);
        }
      }
    })();
    return { cart: this.get(userId), skippedProductIds: skipped.filter(Boolean) };
  }

  private validCoupon(code: string | null): CouponRow | null {
    if (!code) return null;
    const coupon = this.repo.findCoupon(code);
    if (!coupon || !coupon.active) return null;
    if (coupon.expires_at && new Date(coupon.expires_at) <= this.clock.now()) return null;
    return coupon;
  }

  private quantityLimit() {
    return new AppError(422, 'QUANTITY_LIMIT', `Quantidade máxima por item: ${MAX_LINE_QUANTITY}.`);
  }

  private toDto(c: PricedCart): CartDto {
    return {
      items: c.lines.map((l) => ({
        id: l.row.id,
        product: {
          id: l.product.id,
          name: l.product.name,
          restaurant: l.product.restaurant,
          imageUrl: l.product.image_url,
          imageHue: l.product.image_hue,
          isAvailable: !!l.product.is_available,
        },
        quantity: l.row.quantity,
        addons: l.addons.map(toAddonDto),
        notes: l.row.notes,
        unitPrice: toReais(l.unitPriceCents),
        total: toReais(l.totalCents),
      })),
      coupon: c.coupon
        ? {
            code: c.coupon.code,
            description: c.coupon.description,
            percentOff: c.coupon.percent_off,
            minSubtotal: toReais(c.coupon.min_subtotal_cents),
            applied: c.couponApplied,
          }
        : null,
      summary: {
        itemCount: c.lines.reduce((n, l) => n + l.row.quantity, 0),
        subtotal: toReais(c.totals.subtotalCents),
        deliveryFee: toReais(c.totals.deliveryFeeCents),
        discount: toReais(c.totals.discountCents),
        total: toReais(c.totals.totalCents),
        freeDeliveryThreshold: toReais(this.config.freeDeliveryThresholdCents),
      },
    };
  }
}
