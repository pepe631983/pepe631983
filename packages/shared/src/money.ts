import Decimal from 'decimal.js';

/** Política única de redondeo monetario (2 decimales por defecto; costos unitarios pueden usar más). */
export const DEFAULT_MONEY_SCALE = 2;
export const UNIT_COST_SCALE = 6;

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export function toMoney(value: string | number | Decimal, scale = DEFAULT_MONEY_SCALE): string {
  return new Decimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP).toFixed(scale);
}

export function addMoney(a: string, b: string, scale = DEFAULT_MONEY_SCALE): string {
  return toMoney(new Decimal(a).plus(b), scale);
}

export function subtractMoney(a: string, b: string, scale = DEFAULT_MONEY_SCALE): string {
  return toMoney(new Decimal(a).minus(b), scale);
}

/** Utilidad bruta = ventas - costo (ejemplo obligatorio del requerimiento). */
export function grossProfit(saleTotal: string, costTotal: string, scale = DEFAULT_MONEY_SCALE): string {
  return subtractMoney(saleTotal, costTotal, scale);
}

export function assertBalancedEntry(
  lines: Array<{ debit: string; credit: string }>,
  scale = DEFAULT_MONEY_SCALE,
): void {
  const totalDebit = lines.reduce((acc, l) => acc.plus(l.debit), new Decimal(0));
  const totalCredit = lines.reduce((acc, l) => acc.plus(l.credit), new Decimal(0));
  if (!totalDebit.toDecimalPlaces(scale).equals(totalCredit.toDecimalPlaces(scale))) {
    throw new Error(
      `Asiento desbalanceado: débitos ${totalDebit.toFixed(scale)} ≠ créditos ${totalCredit.toFixed(scale)}`,
    );
  }
}
