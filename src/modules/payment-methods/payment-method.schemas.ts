import { z } from 'zod';
import type { PaymentMethodRow } from './payment-method.repository';

export const PAYMENT_LABELS = {
  pix: 'PIX',
  credit: 'Cartão de crédito',
  debit: 'Cartão de débito',
  cash: 'Dinheiro',
} as const;

export const paymentTypeField = z.enum(['pix', 'credit', 'debit', 'cash']);

export const createPaymentMethodBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pix') }),
  z.object({ type: z.literal('cash') }),
  z.object({
    type: z.enum(['credit', 'debit']),
    brand: z.string().trim().min(2, 'Informe a bandeira do cartão.').max(30),
    last4: z.string().regex(/^\d{4}$/, 'Informe os 4 últimos dígitos.'),
  }),
]);

export const paymentMethodDto = z.object({
  id: z.number().int(),
  type: paymentTypeField,
  label: z.string().describe('Ex.: "Cartão de crédito"'),
  detail: z.string().describe('Ex.: "Visa •••• 4410", "Aprovação imediata"'),
  brand: z.string().nullable(),
  last4: z.string().nullable(),
});

export function paymentDetail(m: Pick<PaymentMethodRow, 'type' | 'brand' | 'last4'>): string {
  switch (m.type) {
    case 'pix':
      return 'Aprovação imediata';
    case 'cash':
      return 'Pagamento na entrega';
    default:
      return `${m.brand} •••• ${m.last4}`;
  }
}

export function toPaymentMethodDto(m: PaymentMethodRow): z.infer<typeof paymentMethodDto> {
  return {
    id: m.id,
    type: m.type,
    label: PAYMENT_LABELS[m.type],
    detail: paymentDetail(m),
    brand: m.brand,
    last4: m.last4,
  };
}
