import { describe, expect, it } from 'vitest';

import { calcularSaldo, sumarImportes } from '../src/utils/decimal';

describe('Cálculos monetarios', () => {
  it('suma importes sin errores de precisión', () => {
    expect(sumarImportes(['0.10', '0.20']).toString()).toBe('0.3');
  });

  it('calcula correctamente el saldo de una cuota', () => {
    expect(calcularSaldo('760', ['300', '200.25']).toString()).toBe('259.75');
  });

  it('permite completar una cuota con pagos parciales', () => {
    expect(calcularSaldo('760', ['300', '460']).isZero()).toBe(true);
  });

  it('detecta un saldo negativo por sobrepago', () => {
    expect(calcularSaldo('760', ['800']).isNegative()).toBe(true);
  });
});
