import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },

  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(new InvalidReceiptTypeError());
    }

    callback(null, true);
  },
}).single('comprobante');

class InvalidReceiptTypeError extends Error {
  constructor() {
    super('Solo se permiten archivos PDF, JPG y PNG');
  }
}

/**
 * Recibe el comprobante y responde los errores de la subida con su mensaje.
 *
 * Sin esto, los errores de multer llegaban al manejador general de `app.ts`
 * sin código HTTP y salían como 500 "Error interno del servidor": un archivo
 * de 6 MB, un `.exe` o un envío cortado parecían una falla del servidor. Como
 * el archivo queda en memoria, todo lo que puede fallar acá es culpa del
 * request, así que nada de esto es un 500.
 */
export function uploadReceipt(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (error: unknown) => {
    if (!error) {
      return next();
    }

    if (error instanceof InvalidReceiptTypeError) {
      return res.status(400).json({ message: error.message });
    }

    if (
      error instanceof multer.MulterError &&
      error.code === 'LIMIT_FILE_SIZE'
    ) {
      return res.status(413).json({
        message: 'El comprobante no puede superar los 5 MB',
      });
    }

    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        message: 'Se espera un único archivo, en el campo "comprobante"',
      });
    }

    // Un multipart mal armado o cortado a la mitad.
    return res.status(400).json({
      message: 'No se pudo leer el archivo enviado',
    });
  });
}
