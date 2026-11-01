import Decimal from 'decimal.js';

type Importe = Decimal | string | number;

export function sumarImportes(importes: Importe[]): Decimal {
  return importes.reduce<Decimal>(
    (total, importe) => total.plus(importe),
    new Decimal(0),
  );
}

export function calcularSaldo(
  importeTotal: Importe,
  importesPagados: Importe[],
): Decimal {
  return new Decimal(importeTotal).minus(sumarImportes(importesPagados));
}
