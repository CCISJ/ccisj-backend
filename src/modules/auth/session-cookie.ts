import type { CookieOptions, Response } from 'express';

export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

// Las mismas opciones al crear y al borrar la cookie: si difieren, el
// navegador la trata como otra cookie y la sesión no se cierra.
function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie('token', token, {
    ...baseOptions(),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('token', baseOptions());
}
