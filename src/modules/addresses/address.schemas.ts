import { z } from 'zod';
import { onlyDigits } from '../../lib/text';
import type { AddressRow } from './address.repository';

const cepField = z
  .string()
  .trim()
  .refine((v) => onlyDigits(v).length === 8, 'CEP inválido.')
  .transform((v) => {
    const d = onlyDigits(v);
    return `${d.slice(0, 5)}-${d.slice(5)}`;
  })
  .describe('Aceita "05422-030" ou "05422030"; armazenado como 00000-000');

const text = (msg: string, max = 120) => z.string().trim().min(1, msg).max(max);

/** Campos da tela "Novo endereço": CEP, Rua e número, Complemento, Bairro e cidade (separados). */
export const createAddressBody = z.object({
  label: text('Informe um nome para o endereço (ex.: Casa).', 40).default('Casa'),
  cep: cepField,
  street: text('Informe rua e número.'),
  complement: z.string().trim().max(80).optional().nullable(),
  neighborhood: text('Informe o bairro.', 80),
  city: text('Informe a cidade.', 80),
  select: z.boolean().default(false).describe('Já seleciona como endereço de entrega'),
});

export const updateAddressBody = z
  .object({
    label: text('Informe um nome para o endereço.', 40),
    cep: cepField,
    street: text('Informe rua e número.'),
    complement: z.string().trim().max(80).nullable(),
    neighborhood: text('Informe o bairro.', 80),
    city: text('Informe a cidade.', 80),
  })
  .partial();

export const addressDto = z.object({
  id: z.number().int(),
  label: z.string(),
  cep: z.string(),
  street: z.string(),
  complement: z.string().nullable(),
  neighborhood: z.string(),
  city: z.string(),
  line: z.string().describe('Linha principal pronta para exibir: "Rua das Palmeiras, 128 · apto 42"'),
  cityLine: z.string().describe('"Pinheiros · São Paulo"'),
  isSelected: z.boolean(),
  mapImageUrl: z.string().nullable().describe('Imagem da área do mapa, relativa à base da API'),
});

const MAP_IMAGE_URL = '/static/maps/area.jpg';

export type AddressDto = z.infer<typeof addressDto>;

export function formatAddressLine(a: Pick<AddressRow, 'street' | 'complement'>): string {
  return a.complement ? `${a.street} · ${a.complement}` : a.street;
}

export function formatCityLine(a: Pick<AddressRow, 'neighborhood' | 'city'>): string {
  return `${a.neighborhood} · ${a.city}`;
}

export function toAddressDto(a: AddressRow): AddressDto {
  return {
    id: a.id,
    label: a.label,
    cep: a.cep,
    street: a.street,
    complement: a.complement,
    neighborhood: a.neighborhood,
    city: a.city,
    line: formatAddressLine(a),
    cityLine: formatCityLine(a),
    isSelected: !!a.is_selected,
    mapImageUrl: MAP_IMAGE_URL,
  };
}
