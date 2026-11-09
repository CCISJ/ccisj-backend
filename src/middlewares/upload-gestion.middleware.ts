import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

import { rechazarNul } from './nul-byte.middleware';

export const GESTION_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Cuántos archivos se pueden mandar en una misma subida. */
export const GESTION_MAX_FILES_PER_UPLOAD = 5;

/**
 * Lo que se puede adjuntar a una gestión: lo que circula en un trámite.
 * El contenido se verifica después (`gestion-storage.service.ts`): el tipo
 * que declara el navegador se falsifica.
 */
export const GESTION_ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

class InvalidGestionFileTypeError extends Error {
  constructor() {
    super(
      'Solo se permiten archivos PDF, JPG, PNG, Word (.docx) y Excel (.xlsx)',
    );
  }
}

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: GESTION_MAX_FILE_SIZE,
    files: GESTION_MAX_FILES_PER_UPLOAD,
  },

  fileFilter: (_req, file, callback) => {
    if (!GESTION_ALLOWED_TYPES.includes(file.mimetype)) {
      return callback(new InvalidGestionFileTypeError());
    }

    callback(null, true);
  },
}).array('archivos', GESTION_MAX_FILES_PER_UPLOAD);

/**
 * Recibe uno o varios archivos de una gestión (campo `archivos`) y responde
 * los errores de la subida con su mensaje, igual que `uploadReceipt` y
 * `uploadCv`: todo lo que puede fallar acá es culpa del request.
 */
export function uploadGestionFiles(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  upload(req, res, (error: unknown) => {
    if (!error) {
      return rechazarNul(req, res, next);
    }

    if (error instanceof InvalidGestionFileTypeError) {
      return res.status(400).json({ message: error.message });
    }

    if (
      error instanceof multer.MulterError &&
      error.code === 'LIMIT_FILE_SIZE'
    ) {
      return res.status(413).json({
        message: 'Cada archivo puede pesar hasta 10 MB',
      });
    }

    if (
      error instanceof multer.MulterError &&
      (error.code === 'LIMIT_FILE_COUNT' ||
        error.code === 'LIMIT_UNEXPECTED_FILE')
    ) {
      return res.status(400).json({
        message: `Se pueden subir hasta ${GESTION_MAX_FILES_PER_UPLOAD} archivos a la vez, en el campo "archivos"`,
      });
    }

    return res.status(400).json({
      message: 'No se pudo leer el archivo enviado',
    });
  });
}
