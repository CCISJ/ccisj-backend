import type { Response } from 'express';

import { Prisma } from '@/generated/prisma/client';

import { HttpError } from './http-error';

type Fallback = {
  // Código para los errores de negocio que tiran los services con `new Error`.
  status: number;
  // Mensaje cuando el error es inesperado.
  message: string;
};

// Los errores de Prisma traen la consulta, nombres de tablas y valores: nunca
// se le muestran al usuario. Estos casos tienen una respuesta clara.
const PRISMA_ERRORS: Record<string, { status: number; message: string }> = {
  P2000: { status: 400, message: 'Uno de los datos es demasiado largo' },
  P2002: { status: 409, message: 'Ya existe un registro con esos datos' },
  P2003: {
    status: 409,
    message: 'No se puede completar porque tiene datos asociados',
  },
  P2025: { status: 404, message: 'El registro no existe' },
};

/** Un `new Error('mensaje')` escrito a propósito en un service. */
function isBusinessError(error: unknown): error is Error {
  return (
    error instanceof Error && Object.getPrototypeOf(error) === Error.prototype
  );
}

/**
 * Responde un error sin filtrar detalles internos:
 * - `HttpError`: su código y su mensaje;
 * - error de negocio (`new Error`): el código del controller y su mensaje;
 * - error conocido de Prisma: un código y un mensaje genéricos;
 * - cualquier otro (un `TypeError`, la base caída): 500 con el mensaje
 *   genérico del controller.
 */
export function sendError(res: Response, error: unknown, fallback: Fallback) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message });
  }

  if (isBusinessError(error)) {
    return res.status(fallback.status).json({ message: error.message });
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    PRISMA_ERRORS[error.code]
  ) {
    return res.status(PRISMA_ERRORS[error.code].status).json({
      message: PRISMA_ERRORS[error.code].message,
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error(error);
  }

  return res.status(500).json({ message: fallback.message });
}
