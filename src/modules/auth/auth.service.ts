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

export async function login(data: LoginData) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET no configurado');
  }

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

  const token = jwt.sign(
    {
      id: user.id,
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: '8h',
    },
  );

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
