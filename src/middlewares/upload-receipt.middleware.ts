import multer from 'multer';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const uploadReceipt = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },

  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return callback(new Error('Solo se permiten archivos PDF, JPG y PNG'));
    }

    callback(null, true);
  },
});
