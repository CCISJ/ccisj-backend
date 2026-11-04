import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommon from '@zxcvbn-ts/language-common';
import * as zxcvbnEs from '@zxcvbn-ts/language-es-es';
import crypto from 'node:crypto';

import { HttpError } from './http-error';

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/**
 * Puntaje mínimo de zxcvbn (de 0 a 4). El 3 es el que la librería describe
 * como "difícil de adivinar": deja afuera las contraseñas filtradas más
 * usadas, las palabras comunes con un número al final ("Montevideo2024"),
 * las secuencias de teclado ("qwerty123456") y las repeticiones.
 */
export const PASSWORD_MIN_SCORE = 3;

/**
 * Palabras de la institución: quien quiera adivinar una contraseña de este
 * sistema las prueba primero.
 */
const CONTEXT_WORDS = [
  'ccisj',
  'camara',
  'cámara',
  'comercio',
  'industria',
  'sanjose',
  'san jose',
  'san josé',
];

/**
 * zxcvbn se arma una sola vez, la primera vez que se usa (carga unos 40.000
 * diccionarios de palabras y tarda unos 80 ms).
 *
 * Con una contraseña larga y armada a propósito ("aB3$" repetido 32 veces)
 * la configuración por defecto tarda más de medio segundo y frena el servidor
 * mientras calcula. Por eso se analizan solo los primeros 64 caracteres y se
 * acotan las sustituciones tipo l33t ("p4ssw0rd"): el peor caso queda en unos
 * 50 ms. Lo que viene después del carácter 64 no se mira, pero una
 * contraseña cuyos primeros 64 caracteres son difíciles de adivinar ya lo es.
 */
let zxcvbn: ZxcvbnFactory | undefined;

function strengthChecker() {
  zxcvbn ??= new ZxcvbnFactory({
    dictionary: { ...zxcvbnCommon.dictionary, ...zxcvbnEs.dictionary },
    graphs: zxcvbnCommon.adjacencyGraphs,
    maxLength: 64,
    l33tMaxSubstitutions: 10,
  });

  return zxcvbn;
}

/**
 * Los datos de la persona, en las formas en que suelen aparecer dentro de una
 * contraseña: el email entero, la parte antes de la @ con y sin separadores
 * ("juan.perez" y "juanperez") y cada palabra suelta de 3 letras o más.
 */
function expandUserInputs(userInputs: unknown[]) {
  const words = new Set<string>(CONTEXT_WORDS);

  for (const input of userInputs) {
    if (typeof input !== 'string') {
      continue;
    }

    const value = input.trim().toLowerCase();
    const local = value.split('@')[0];
    const parts = value.split(/[^\p{L}\p{Nd}]+/u);

    for (const word of [value, local, local.replace(/[^\p{L}\p{Nd}]/gu, '')]) {
      if (word.length >= 3) {
        words.add(word);
      }
    }

    for (const part of parts) {
      if (part.length >= 3) {
        words.add(part);
      }
    }
  }

  return [...words];
}

/**
 * Reglas de toda contraseña que se elige: entre 12 y 128 caracteres, con al
 * menos una letra y un número, y difícil de adivinar según zxcvbn (la
 * librería que creó Dropbox), con diccionarios en español. `userInputs` son
 * los datos de la persona (email, nombre, apellido), para no aceptar una
 * contraseña armada con ellos. `label` arma el mensaje ("La contraseña",
 * "La nueva contraseña"). No se recortan espacios: la contraseña es
 * exactamente lo que se escribió.
 */
export function assertPasswordPolicy(
  password: string,
  label: string,
  userInputs: unknown[] = [],
) {
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

  const { score } = strengthChecker().check(
    password,
    expandUserInputs(userInputs),
  );

  if (score < PASSWORD_MIN_SCORE) {
    throw new HttpError(
      400,
      `${label} es fácil de adivinar. Evitá palabras comunes, nombres, ` +
        'fechas, secuencias como 1234 o qwerty y tus propios datos. ' +
        'Varias palabras sueltas juntas son más seguras.',
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
