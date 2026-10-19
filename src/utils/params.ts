/**
 * Valor de un parámetro de consulta que se espera una sola vez
 * (`?tipo=INGRESO`).
 *
 * Express entrega un **arreglo** cuando el parámetro viene repetido
 * (`?tipo=A&tipo=B`), así que el tipo de `req.query` no es solo texto.
 * `String(valor)` sobre un arreglo no falla: devuelve `"A,B"`, y ese texto
 * que nadie escribió sigue camino como si lo hubiera mandado el cliente. En un
 * filtro de búsqueda eso termina buscando literalmente `"A,B"` y devolviendo
 * un resultado vacío sin explicar por qué.
 *
 * Preferimos cortar con un 400 antes que adivinar: si el parámetro vino
 * repetido, la petición está mal armada y conviene decirlo.
 */
export function singleQueryParam(value: unknown, name: string) {
  if (value === undefined) return undefined;

  if (typeof value !== 'string') {
    throw new Error(`El parámetro ${name} vino repetido más de una vez`);
  }

  return value === '' ? undefined : value;
}

/** El ID más grande que entra en una columna `INTEGER` de PostgreSQL. */
const MAX_ID = 2_147_483_647;

/**
 * ID de ruta (`/recurso/:id`). Devuelve null si no es un entero positivo:
 * `Number('1.5')` o `Number('')` no son IDs aunque no den NaN.
 *
 * Tampoco uno más grande que `MAX_ID`: ese registro no puede existir, y la
 * base rechazaba la consulta con un error que llegaba como 500 (lo encontró el
 * escaneo de ZAP con `/socios/3059842083074936368`).
 */
export function parseId(value: unknown) {
  const id = Number(value);

  return Number.isInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}
