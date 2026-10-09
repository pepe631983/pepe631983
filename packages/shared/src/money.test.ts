import { describe, expect, it } from 'vitest';
import { assertBalancedEntry, grossProfit, toMoney } from './money';

describe('money', () => {
  it('redondea con política half-up', () => {
    expect(toMoney('10.005')).toBe('10.01');
    expect(toMoney('10.004')).toBe('10.00');
  });

  it('calcula utilidad bruta del ejemplo obligatorio (60 costo, 100 venta)', () => {
    expect(grossProfit('100', '60')).toBe('40.00');
  });

  it('exige débitos iguales a créditos', () => {
    expect(() =>
      assertBalancedEntry([
        { debit: '60', credit: '0' },
        { debit: '0', credit: '60' },
      ]),
    ).not.toThrow();
    expect(() =>
      assertBalancedEntry([
        { debit: '60', credit: '0' },
        { debit: '0', credit: '59' },
      ]),
    ).toThrow(/desbalanceado/);
  });
});
