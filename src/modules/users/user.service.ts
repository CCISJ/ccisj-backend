import argon2 from 'argon2';

import { TipoUsuario } from '@/types/user.type';
import { EMAIL_MAX, EMAIL_PATTERN, normalizeEmail } from '@/utils/email';
import { HttpError } from '@/utils/http-error';
import { assertPasswordPolicy } from '@/utils/password';
import * as userRepository from './user.repository';

const USER_TYPES: TipoUsuario[] = ['ADMIN', 'POSTULANTE', 'SOCIO'];

function isUserType(value: unknown): value is TipoUsuario {
  return USER_TYPES.includes(value as TipoUsuario);
}

function assertObject(body: unknown): asserts body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Datos inválidos');
  }
}

function parseEmail(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'El email no es válido');
  }

  const email = normalizeEmail(value);

  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'El email no es válido');
  }

  return email;
}

// Una cuenta de socio sin su ficha de empresa no sirve para nada: los socios
// se crean desde /socios, que arma las dos cosas juntas.
function assertNotMemberType(tipo: TipoUsuario) {
  if (tipo === 'SOCIO') {
    throw new HttpError(
      400,
      'Las cuentas de socio se crean desde la sección Socios',
    );
  }
}

export async function getAll() {
  return userRepository.findAll();
}

export async function getById(id: number) {
  const usuario = await userRepository.findById(id);

  if (!usuario) {
    throw new HttpError(404, 'Usuario no encontrado');
  }

  return usuario;
}

export async function findNotificationRecipients() {
  return userRepository.findNotificationRecipients();
}

export async function create(body: unknown) {
  assertObject(body);

  if (!body.email || !body.password || !body.tipo) {
    throw new HttpError(400, 'Faltan datos obligatorios');
  }

  if (typeof body.password !== 'string') {
    throw new HttpError(400, 'Datos inválidos');
  }

  if (!isUserType(body.tipo)) {
    throw new HttpError(400, 'El tipo de usuario no es válido');
  }

  assertNotMemberType(body.tipo);

  const email = parseEmail(body.email);

  assertPasswordPolicy(body.password, 'La contraseña');

  const existingUser = await userRepository.findByEmail(email);

  if (existingUser) {
    throw new HttpError(400, 'El email ya está registrado');
  }

  const password = await argon2.hash(body.password);

  return userRepository.create({
    email,
    password,
    tipo: body.tipo,
  });
}

/**
 * La administración edita email, tipo y estado de una cuenta, con límites que
 * evitan dejar el sistema en un estado roto:
 * - el tipo no cambia si la cuenta ya tiene ficha de socio o de postulante
 *   (quedaría, por ejemplo, un ADMIN con una empresa asociada);
 * - nadie se quita a sí mismo el rol de administrador ni se desactiva;
 * - un socio se da de baja desde /socios, que además cierra sus ofertas.
 */
export async function update(id: number, body: unknown, actorId: number) {
  assertObject(body);

  const usuario = await userRepository.findProfiles(id);

  if (!usuario) {
    throw new HttpError(404, 'Usuario no encontrado');
  }

  const changes: {
    email?: string;
    tipo?: TipoUsuario;
    activo?: boolean;
  } = {};

  if (body.email !== undefined) {
    changes.email = parseEmail(body.email);

    const existingUser = await userRepository.findByEmail(changes.email);

    if (existingUser && existingUser.id !== id) {
      throw new HttpError(400, 'El email ya está registrado');
    }
  }

  if (body.tipo !== undefined) {
    if (!isUserType(body.tipo)) {
      throw new HttpError(400, 'El tipo de usuario no es válido');
    }

    if (body.tipo !== usuario.tipo) {
      if (usuario.socio || usuario.postulante) {
        throw new HttpError(
          400,
          'No se puede cambiar el tipo de una cuenta que tiene ficha de socio o de postulante',
        );
      }

      if (id === actorId) {
        throw new HttpError(
          400,
          'No podés quitarte el rol de administrador a vos mismo',
        );
      }

      assertNotMemberType(body.tipo);
    }

    changes.tipo = body.tipo;
  }

  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') {
      throw new HttpError(400, 'El campo activo no es válido');
    }

    if (!body.activo && id === actorId) {
      throw new HttpError(400, 'No podés desactivar tu propia cuenta');
    }

    if (!body.activo && usuario.socio) {
      throw new HttpError(
        400,
        'Para dar de baja un socio usá la sección Socios: así también se cierran sus ofertas',
      );
    }

    changes.activo = body.activo;
  }

  return userRepository.update(id, changes);
}

export async function remove(id: number, actorId: number) {
  const usuario = await userRepository.findById(id);

  if (!usuario) {
    throw new HttpError(404, 'Usuario no encontrado');
  }

  if (id === actorId) {
    throw new HttpError(400, 'No podés eliminar tu propia cuenta');
  }

  const deleted = await userRepository.remove(id);

  if (!deleted) {
    throw new HttpError(
      409,
      'La cuenta tiene datos asociados (empresa, ofertas o notificaciones enviadas) y no se puede eliminar. Desactivala.',
    );
  }
}
