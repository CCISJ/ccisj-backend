/**
 * El día de hoy en Uruguay, como medianoche UTC de ese día.
 *
 * Las fechas sin hora (el vencimiento de una cuota, la vigencia de una
 * configuración, la fecha de un movimiento de caja o de un pago) llegan como
 * `AAAA-MM-DD` y se guardan como medianoche UTC. Para compararlas con "hoy"
 * hace falta el mismo formato, pero del día en Uruguay: el día UTC ya es el
 * siguiente desde las 21 de acá. Con el día UTC, una cuota que vencía hoy
 * figuraba vencida desde las 21, el resumen "del mes" pasaba al mes siguiente
 * a las 21 del último día, y la cuota del año nuevo entraba en vigencia el
 * 31/12 a las 21.
 */
export function uruguayToday(now = new Date()) {
  const day = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Montevideo',
  });

  return new Date(`${day}T00:00:00.000Z`);
}
