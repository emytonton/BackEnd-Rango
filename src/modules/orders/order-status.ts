/**
 * Máquina de estados do pedido (timeline do protótipo).
 *   step 0 Pedido recebido → 1 confirmado → 2 em preparação → 3 saiu para entrega → 4 entregue
 *   status: 'live' (steps 0-3) | 'done' (step 4) | 'cancel'
 * Sem restaurante/entregador reais, o avanço é simulado: a cada ORDER_STEP_SECONDS
 * desde a última etapa o pedido avança uma etapa (calculado sob demanda, na leitura).
 */
export const ORDER_STEPS = [
  'Pedido recebido',
  'Pedido confirmado',
  'Em preparação',
  'Saiu para entrega',
  'Entregue',
] as const;

export const STEP_HINTS = [
  'Aguardando o restaurante',
  'O restaurante aceitou seu pedido',
  'Seu pedido está sendo preparado',
  'O entregador está levando seu pedido',
  'Bom apetite!',
] as const;

export const LAST_STEP = ORDER_STEPS.length - 1;
/** Pedidos podem ser cancelados até a confirmação pelo restaurante. */
export const MAX_CANCELLABLE_STEP = 1;

export type OrderStatus = 'live' | 'done' | 'cancel';

export function statusLabel(status: OrderStatus, step: number): string {
  if (status === 'cancel') return 'Cancelado';
  if (status === 'done') return ORDER_STEPS[LAST_STEP];
  return ORDER_STEPS[step];
}

export interface Advance {
  step: number;
  at: Date;
}

/**
 * Calcula as etapas que já deveriam ter acontecido desde `lastEventAt`.
 * Retorna lista vazia quando a simulação está desligada (stepSeconds = 0).
 */
export function pendingAdvances(currentStep: number, lastEventAt: Date, now: Date, stepSeconds: number): Advance[] {
  if (stepSeconds <= 0) return [];
  const out: Advance[] = [];
  let step = currentStep;
  let at = lastEventAt.getTime();
  const stepMs = stepSeconds * 1000;
  while (step < LAST_STEP && now.getTime() - at >= stepMs) {
    step += 1;
    at += stepMs;
    out.push({ step, at: new Date(at) });
  }
  return out;
}

export const formatOrderCode = (id: number) => `RG-${id}`;

/** Aceita "RG-10482" ou "10482". */
export function parseOrderCode(value: string): number | null {
  const m = /^(?:RG-)?(\d{1,12})$/i.exec(value.trim());
  return m ? Number(m[1]) : null;
}

export const COURIERS = [
  { name: 'Rafael Souza', vehicle: 'Honda CG 160' },
  { name: 'Juliana Prado', vehicle: 'Yamaha Factor 150' },
  { name: 'Diego Martins', vehicle: 'Bicicleta elétrica' },
] as const;
