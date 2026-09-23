/** Fonte de tempo injetável: permite testar a progressão de pedidos sem esperar. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export const nowIso = (clock: Clock) => clock.now().toISOString();
