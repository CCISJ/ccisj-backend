import { describe, expect, it } from 'vitest';

import { validarImporteUYU } from '../src/utils/money';

describe('Importes en pesos uruguayos', () => {
  it.each([100, 150.25, 0.01, '250.50'])(
    'acepta el importe válido %s',
    (importe) => {
      expect(validarImporteUYU(importe)).toBeGreaterThan(0);
    },
  );

  it.each([100.999, 0.001, '25.123', -10, 0, NaN, Infinity, null, 'abc'])(
    'rechaza el importe inválido %s',
    (importe) => {
      expect(() => validarImporteUYU(importe)).toThrow(/importe debe/);
    },
  );

  it('rechaza un resultado con errores de precisión', () => {
    expect(() => validarImporteUYU(0.1 + 0.2)).toThrow(
      'El importe debe tener como máximo dos decimales',
    );
  });

  it('rechaza importes que exceden Decimal(10,2)', () => {
    expect(() => validarImporteUYU('100000000')).toThrow(
      'El importe supera el máximo permitido',
    );
  });
});
