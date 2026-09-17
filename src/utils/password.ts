import crypto from 'node:crypto';

import { HttpError } from './http-error';

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/**
 * Reglas de toda contraseña que se elige: entre 10 y 128 caracteres, con al
 * menos una letra y un número. `label` arma el mensaje ("La contraseña",
 * "La nueva contraseña"). No se recortan espacios: la contraseña es
 * exactamente lo que se escribió.
 */
export function assertPasswordPolicy(password: string, label: string) {
  if (password.length < PASSWORD_MIN) {
    throw new HttpError(
      400,
      `${label} debe tener al menos ${PASSWORD_MIN} caracteres`,
    );
  }

  if (password.length > PASSWORD_MAX) {
    throw new HttpError(
      400,
      `${label} no puede superar los ${PASSWORD_MAX} caracteres`,
    );
  }

  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) {
    throw new HttpError(
      400,
      `${label} debe tener al menos una letra y un número`,
    );
  }
}

// Sin caracteres que se confunden al dictarla o copiarla a mano (0/O, 1/l/I).
const LETTERS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHABET = LETTERS + DIGITS;

/**
 * Contraseña al azar para entregar a mano (alta de un socio). 12 caracteres
 * (unos 70 bits) que cumplen las reglas: siempre con letras y números.
 */
export function generatePassword(length = 12) {
  for (;;) {
    const password = Array.from(
      { length },
      () => ALPHABET[crypto.randomInt(ALPHABET.length)],
    ).join('');

    if (/[a-zA-Z]/.test(password) && /\d/.test(password)) {
      return password;
    }
  }
}
