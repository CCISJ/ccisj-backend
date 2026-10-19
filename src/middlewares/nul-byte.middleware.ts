import type { NextFunction, Request, Response } from 'express';

const MENSAJE = 'Los datos enviados tienen caracteres no válidos';

/**
 * Si algún texto, en cualquier nivel, tiene el carácter NUL (`\u0000`).
 * Revisa también las claves: un campo que no se usa no llega a la base,
 * pero no hay ningún motivo legítimo para mandarlo.
 */
export function tieneNul(valor: unknown): boolean {
  if (typeof valor === 'string') return valor.includes('\u0000');
  if (Array.isArray(valor)) return valor.some(tieneNul);

  if (typeof valor === 'object' && valor !== null) {
    return Object.entries(valor).some(
      ([clave, campo]) => clave.includes('\u0000') || tieneNul(campo),
    );
  }

  return false;
}

/**
 * Rechaza con 400 cualquier request con un carácter NUL en el body o en la
 * query.
 *
 * PostgreSQL no puede guardar ese carácter en un texto ni compararlo: la base
 * responde "invalid byte sequence for encoding UTF8: 0x00", y eso llegaba al
 * usuario como un 500. El escaneo activo de ZAP lo provocó en casi todos los
 * endpoints que guardan o buscan texto. Ningún dato real lo lleva, así que se
 * corta acá, una vez, en vez de validarlo campo por campo.
 *
 * Va en `app.ts` para el JSON y la query, y otra vez al final de
 * `uploadReceipt`, porque los campos de un multipart los lee multer dentro de
 * la ruta, cuando esta revisión general ya pasó.
 */
export function rechazarNul(req: Request, res: Response, next: NextFunction) {
  if (tieneNul(req.body) || tieneNul(req.query)) {
    return res.status(400).json({ message: MENSAJE });
  }

  next();
}
