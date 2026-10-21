import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

import { rechazarNul } from './nul-byte.middleware';

export const CV_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Cuántos PDF se pueden mandar en una misma subida. */
export const CV_MAX_FILES_PER_UPLOAD = 5;

class InvalidCvTypeError extends Error {
  constructor() {
    super('Solo se permiten archivos PDF');
  }
}

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: CV_MAX_FILE_SIZE,
    files: CV_MAX_FILES_PER_UPLOAD,
  },

  // Primer filtro por el tipo que declara el navegador. El contenido se
  // verifica después (`cv-storage.service.ts`): el tipo declarado se falsifica.
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      return callback(new InvalidCvTypeError());
    }

    callback(null, true);
  },
}).array('archivos', CV_MAX_FILES_PER_UPLOAD);

/**
 * Recibe uno o varios CV en PDF (campo `archivos`) y responde los errores de
 * la subida con su mensaje, igual que `uploadReceipt`: todo lo que puede
 * fallar acá es culpa del request, así que nada es un 500.
 */
export function uploadCvFiles(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (error: unknown) => {
    if (!error) {
      return rechazarNul(req, res, next);
    }

    if (error instanceof InvalidCvTypeError) {
      return res.status(400).json({ message: error.message });
    }

    if (
      error instanceof multer.MulterError &&
      error.code === 'LIMIT_FILE_SIZE'
    ) {
      return res.status(413).json({
        message: 'Cada CV no puede superar los 5 MB',
      });
    }

    if (
      error instanceof multer.MulterError &&
      (error.code === 'LIMIT_FILE_COUNT' ||
        error.code === 'LIMIT_UNEXPECTED_FILE')
    ) {
      return res.status(400).json({
        message: `Se pueden subir hasta ${CV_MAX_FILES_PER_UPLOAD} PDF a la vez, en el campo "archivos"`,
      });
    }

    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        message: 'No se pudo leer el archivo enviado',
      });
    }

    return res.status(400).json({
      message: 'No se pudo leer el archivo enviado',
    });
  });
}
