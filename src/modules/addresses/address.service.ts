import type { DB } from '../../db/connection';
import type { Clock } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import type { AddressFields, AddressRepository } from './address.repository';
import { toAddressDto } from './address.schemas';

export class AddressService {
  constructor(
    private readonly db: DB,
    private readonly repo: AddressRepository,
    private readonly clock: Clock,
  ) {}

  list(userId: number) {
    return this.repo.listByUser(userId).map(toAddressDto);
  }

  selected(userId: number) {
    const row = this.repo.findSelected(userId);
    return row ? toAddressDto(row) : null;
  }

  /** O primeiro endereço do usuário é selecionado automaticamente. */
  create(userId: number, fields: AddressFields & { select?: boolean }) {
    const now = this.clock.now().toISOString();
    const id = this.db.transaction(() => {
      const { select, ...data } = fields;
      const newId = this.repo.create(userId, data, now);
      if (select || !this.repo.findSelected(userId)) this.repo.select(userId, newId, now);
      return newId;
    })();
    return toAddressDto(this.repo.findById(userId, id)!);
  }

  update(userId: number, id: number, fields: Partial<AddressFields>) {
    this.ensure(userId, id);
    this.repo.update(userId, id, fields, this.clock.now().toISOString());
    return toAddressDto(this.repo.findById(userId, id)!);
  }

  select(userId: number, id: number) {
    this.ensure(userId, id);
    this.db.transaction(() => this.repo.select(userId, id, this.clock.now().toISOString()))();
    return toAddressDto(this.repo.findById(userId, id)!);
  }

  /** Ao remover o endereço selecionado, o mais recente passa a ser o selecionado. */
  remove(userId: number, id: number): void {
    const row = this.ensure(userId, id);
    this.db.transaction(() => {
      this.repo.delete(userId, id);
      if (row.is_selected) {
        const next = this.repo.mostRecentId(userId);
        if (next) this.repo.select(userId, next, this.clock.now().toISOString());
      }
    })();
  }

  private ensure(userId: number, id: number) {
    const row = this.repo.findById(userId, id);
    if (!row) throw notFound('Endereço não encontrado.');
    return row;
  }
}
