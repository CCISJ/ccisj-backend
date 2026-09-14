/**
 * Error con código HTTP. Los services lo tiran cuando el motivo del fallo
 * determina la respuesta (403, 404) y los controllers lo respetan en vez de
 * aplicar su código genérico.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function statusFor(error: unknown, fallback: number) {
  return error instanceof HttpError ? error.status : fallback;
}
