import { describe, expect, it } from 'vitest';

import { HttpError } from '../src/utils/http-error';
import {
  PASSWORD_MIN,
  assertPasswordPolicy,
  generatePassword,
} from '../src/utils/password';

const FACIL = 'La contraseña es fácil de adivinar';

/**
 * El mensaje con el que se rechaza, o `undefined` si se acepta. Un error que
 * no sea un 400 de `HttpError` se deja pasar, y el test falla.
 */
function rejection(password: string, userInputs?: unknown[]) {
  try {
    assertPasswordPolicy(password, 'La contraseña', userInputs);
    return undefined;
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) {
      return error.message;
    }

    throw error;
  }
}

describe('Política de contraseñas', () => {
  it(`exige al menos ${PASSWORD_MIN} caracteres`, () => {
    expect(rejection('Faro-Tilo-1')).toBe(
      'La contraseña debe tener al menos 12 caracteres',
    );
    expect(rejection('Faro-Tilo-12')).toBeUndefined();
  });

  it.each([
    ['una de las más usadas', 'Password1234'],
    ['una secuencia del teclado', 'qwerty123456'],
    ['una palabra en español con el año', 'Montevideo2024'],
    ['una letra repetida', 'aaaaaaaaaaa1'],
    ['una secuencia de números', 'Clave123456789'],
    // Puntaje 2 de zxcvbn: queda justo debajo del mínimo.
    ['una palabra común con números', 'Incorrecta123'],
  ])('rechaza %s (%s) aunque cumpla el largo', (_, password) => {
    expect(rejection(password)).toMatch(FACIL);
  });

  it.each([
    'Faro-Tilo-Gaviota-47',
    'NuevaClave2026',
    'clave-en-claro-lechuza-1',
  ])('acepta una difícil de adivinar (%s)', (password) => {
    expect(rejection(password)).toBeUndefined();
  });

  it('rechaza una contraseña armada con el nombre de la persona', () => {
    // Sin los datos de la persona, la misma contraseña pasa.
    expect(rejection('Zorbatelo2026')).toBeUndefined();
    expect(rejection('Zorbatelo2026', ['Zorbatelo', 'Quindarim'])).toMatch(
      FACIL,
    );
  });

  it('rechaza una contraseña armada con el email, también sin los puntos', () => {
    const email = 'zorbatelo.quindarim@correo.uy';

    expect(rejection('Zorbatelo2026', [email])).toMatch(FACIL);
    expect(rejection('ZorbateloQuindarim1', [email])).toMatch(FACIL);
  });

  it('rechaza una contraseña armada con el nombre de la institución', () => {
    // zxcvbn no conoce "ccisj": sin la lista de palabras de la institución,
    // esta contraseña tendría puntaje 3 y pasaría.
    expect(rejection('Ccisj20251231')).toMatch(FACIL);
  });

  it('ignora los datos que no son texto', () => {
    expect(
      rejection('Faro-Tilo-Gaviota-47', [undefined, null, 42, {}]),
    ).toBeUndefined();
  });

  it('las contraseñas que genera el sistema cumplen la política', () => {
    for (let i = 0; i < 20; i++) {
      expect(rejection(generatePassword())).toBeUndefined();
    }
  });
});
