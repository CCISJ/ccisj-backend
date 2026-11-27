-- Las cuotas vencen el último día del mes siguiente a su período: la de
-- setiembre, el 31 de octubre; la de diciembre, el 31 de enero (backend #124).
--
-- Las generadas antes de esa regla vencían el último día de su mismo mes, y
-- las del seed, el día 15. Esta migración corre el vencimiento de todas las
-- que no cumplen la regla. Solo cambia la fecha: no toca importes, pagos ni
-- el estado guardado de la cuota. El estado del socio (al día, pendiente o
-- deudor) no se guarda, se calcula con esta fecha, así que se actualiza solo.
--
-- Es idempotente: una cuota que ya cumple la regla no se toca, y volver a
-- correrla no cambia nada.
UPDATE "cuota"
SET "fecha_vencimiento" = (
  date_trunc('month', "periodo_desde") + INTERVAL '2 months' - INTERVAL '1 day'
)::date
WHERE "fecha_vencimiento" <> (
  date_trunc('month', "periodo_desde") + INTERVAL '2 months' - INTERVAL '1 day'
)::date;
