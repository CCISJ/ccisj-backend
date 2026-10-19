/**
 * Escapa los comodines de `LIKE` para que un texto se compare literal.
 *
 * Hace falta en toda búsqueda de Prisma con `mode: 'insensitive'`: Prisma la
 * arma con `ILIKE` y le pasa el texto tal cual, sin escapar nada. Sin esto:
 *
 * - en el login, el email `%` entraba a la primera cuenta con esa contraseña,
 *   y `adm_n@ccisj.uy` a la de `admin@ccisj.uy` (H-16);
 * - una categoría `Ventas%` "ya existía" si había cualquier otra que empezara
 *   con "Ventas";
 * - buscar `%` en la caja devolvía todos los movimientos;
 * - un texto que terminaba en `\` era un patrón inválido, y la base respondía
 *   con un error que llegaba al usuario como 500.
 *
 * Lo encontró el escaneo activo de ZAP, siguiendo esos 500. La barra se
 * escapa porque es el carácter de escape por omisión de PostgreSQL.
 */
export function escapeLike(texto: string) {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}
