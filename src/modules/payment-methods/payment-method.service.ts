import type { Clock } from '../../lib/clock';
import { conflict, notFound } from '../../lib/errors';
import type { NewPaymentMethod, PaymentMethodRepository } from './payment-method.repository';
import { PAYMENT_LABELS, toPaymentMethodDto } from './payment-method.schemas';

export class PaymentMethodService {
  constructor(
    private readonly repo: PaymentMethodRepository,
    private readonly clock: Clock,
  ) {}

  list(userId: number) {
    return this.repo.listByUser(userId).map(toPaymentMethodDto);
  }

  create(userId: number, input: NewPaymentMethod) {
    if ((input.type === 'pix' || input.type === 'cash') && this.repo.existsOfType(userId, input.type)) {
      throw conflict('PAYMENT_METHOD_EXISTS', `${PAYMENT_LABELS[input.type]} já está cadastrado.`);
    }
    const isCard = input.type === 'credit' || input.type === 'debit';
    const row = this.repo.create(
      userId,
      { type: input.type, brand: isCard ? input.brand : null, last4: isCard ? input.last4 : null },
      this.clock.now().toISOString(),
    );
    return toPaymentMethodDto(row);
  }

  remove(userId: number, id: number): void {
    if (!this.repo.delete(userId, id)) throw notFound('Forma de pagamento não encontrada.');
  }
}
