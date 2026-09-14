/**
 * ID de ruta (`/recurso/:id`). Devuelve null si no es un entero positivo:
 * `Number('1.5')` o `Number('')` no son IDs aunque no den NaN.
 */
export function parseId(value: unknown) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 ? id : null;
}
