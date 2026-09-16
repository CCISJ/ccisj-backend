import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

import * as usuarioRepository from '@/modules/users/user.repository';
import { HttpError } from '@/utils/http-error';

type LoginData = {
  email: string;
  password: string;
};

// Hash de una contraseña que nadie tiene. Cuando el email no existe se
// verifica igual contra este hash, para que la respuesta tarde lo mismo y no
// delate qué emails están registrados.
let dummyHash: Promise<string> | null = null;

function getDummyHash() {
  dummyHash ??= argon2.hash('ccisj-usuario-inexistente');

  return dummyHash;
}

async function passwordMatches(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Un hash corrupto o en otro formato no autentica a nadie.
    return false;
  }
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET no configurado');
  }

  return secret;
}

/** Token de sesión. `issuedAt` (en segundos) fija el momento de emisión. */
function signSession(userId: number, issuedAt?: number) {
  return jwt.sign(
    issuedAt === undefined ? { id: userId } : { id: userId, iat: issuedAt },
    jwtSecret(),
    {
      algorithm: 'HS256',
      expiresIn: '8h',
    },
  );
}

export async function login(data: LoginData) {
  const user = await usuarioRepository.findByEmail(data.email);

  if (!user) {
    await passwordMatches(await getDummyHash(), data.password);

    throw new HttpError(401, 'Credenciales inválidas');
  }

  const passwordOk = await passwordMatches(user.password, data.password);

  if (!passwordOk) {
    throw new HttpError(401, 'Credenciales inválidas');
  }

  // Recién con la contraseña correcta se informa que la cuenta está
  // desactivada; antes, cualquiera podía averiguarlo con solo el email.
  if (!user.activo) {
    throw new HttpError(401, 'Usuario inactivo');
  }

  const token = signSession(user.id);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      tipo: user.tipo,
    },
  };
}

export async function me(userId: number) {
  const user = await usuarioRepository.findByIdWithProfile(userId);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  if (!user.activo) {
    throw new Error('Usuario inactivo');
  }

  let displayName = 'Usuario';

  if (user.tipo === 'ADMIN') {
    displayName = 'Administración CCISJ';
  }

  if (user.tipo === 'SOCIO' && user.socio) {
    displayName = user.socio.razonSocial;
  }

  if (user.tipo === 'POSTULANTE' && user.postulante) {
    displayName =
      `${user.postulante.nombre} ${user.postulante.apellido}`.trim();
  }

  return {
    id: user.id,
    email: user.email,
    tipo: user.tipo,
    displayName,
    memberType: user.socio?.tipo ?? null,
  };
}

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/**
 * Cambia la contraseña de la cuenta de la sesión. Pide la actual, valida la
 * nueva y marca el momento del cambio, con lo que las demás sesiones de la
 * cuenta dejan de valer. Devuelve un token nuevo para la sesión actual.
 */
export async function changePassword(userId: number, body: unknown) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Datos inválidos');
  }

  const { passwordActual, passwordNueva } = body as Record<string, unknown>;

  if (typeof passwordActual !== 'string' || !passwordActual) {
    throw new HttpError(400, 'Ingresá tu contraseña actual');
  }

  if (typeof passwordNueva !== 'string' || !passwordNueva) {
    throw new HttpError(400, 'Ingresá la nueva contraseña');
  }

  // Sin recortar espacios: la contraseña es exactamente lo que se escribió.
  if (passwordNueva.length < PASSWORD_MIN) {
    throw new HttpError(
      400,
      `La nueva contraseña debe tener al menos ${PASSWORD_MIN} caracteres`,
    );
  }

  if (passwordNueva.length > PASSWORD_MAX) {
    throw new HttpError(
      400,
      `La nueva contraseña no puede superar los ${PASSWORD_MAX} caracteres`,
    );
  }

  if (!/\p{L}/u.test(passwordNueva) || !/\p{Nd}/u.test(passwordNueva)) {
    throw new HttpError(
      400,
      'La nueva contraseña debe tener al menos una letra y un número',
    );
  }

  if (passwordNueva === passwordActual) {
    throw new HttpError(
      400,
      'La nueva contraseña tiene que ser distinta de la actual',
    );
  }

  const user = await usuarioRepository.findPasswordHash(userId);

  // Un texto enorme no llega a argon2: ninguna contraseña válida lo supera.
  const currentOk =
    !!user &&
    passwordActual.length <= PASSWORD_MAX &&
    (await passwordMatches(user.password, passwordActual));

  if (!currentOk) {
    throw new HttpError(400, 'La contraseña actual no es correcta');
  }

  // Redondeado al segundo, la misma precisión que el `iat` del token.
  const issuedAt = Math.floor(Date.now() / 1000);

  await usuarioRepository.updatePassword(
    userId,
    await argon2.hash(passwordNueva),
    new Date(issuedAt * 1000),
  );

  return { token: signSession(userId, issuedAt) };
}
