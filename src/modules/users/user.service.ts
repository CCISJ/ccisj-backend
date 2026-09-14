import argon2 from 'argon2';

import { TipoUsuario } from '@/types/user.type';
import * as usuarioRepository from './user.repository';

const USER_TYPES: TipoUsuario[] = ['ADMIN', 'POSTULANTE', 'SOCIO'];

function isUserType(value: unknown): value is TipoUsuario {
  return USER_TYPES.includes(value as TipoUsuario);
}

export async function getAll() {
  return usuarioRepository.findAll();
}

export async function getById(id: number) {
  const usuario = await usuarioRepository.findById(id);

  if (!usuario) {
    throw new Error('Usuario no encontrado');
  }

  return usuario;
}

export async function create(data: {
  email?: unknown;
  password?: unknown;
  tipo?: unknown;
}) {
  if (!data.email || !data.password || !data.tipo) {
    throw new Error('Faltan datos obligatorios');
  }

  if (typeof data.email !== 'string' || typeof data.password !== 'string') {
    throw new Error('Datos inválidos');
  }

  if (!isUserType(data.tipo)) {
    throw new Error('El tipo de usuario no es válido');
  }

  const email = data.email.trim();

  const existingUser = await usuarioRepository.findByEmail(email);

  if (existingUser) {
    throw new Error('El email ya está registrado');
  }

  // La contraseña se guardaba tal cual llegaba: además de exponerla, esa
  // cuenta nunca podía iniciar sesión porque el login espera un hash argon2.
  const password = await argon2.hash(data.password);

  return usuarioRepository.create({
    email,
    password,
    tipo: data.tipo,
  });
}

export async function update(
  id: number,
  data: {
    email?: unknown;
    tipo?: unknown;
    activo?: unknown;
  },
) {
  const usuario = await usuarioRepository.findById(id);

  if (!usuario) {
    throw new Error('Usuario no encontrado');
  }

  const changes: {
    email?: string;
    tipo?: TipoUsuario;
    activo?: boolean;
  } = {};

  if (data.email !== undefined) {
    if (typeof data.email !== 'string' || !data.email.trim()) {
      throw new Error('El email no es válido');
    }

    changes.email = data.email.trim();

    const existingUser = await usuarioRepository.findByEmail(changes.email);

    if (existingUser && existingUser.id !== id) {
      throw new Error('El email ya está registrado');
    }
  }

  if (data.tipo !== undefined) {
    if (!isUserType(data.tipo)) {
      throw new Error('El tipo de usuario no es válido');
    }

    changes.tipo = data.tipo;
  }

  if (data.activo !== undefined) {
    if (typeof data.activo !== 'boolean') {
      throw new Error('El campo activo no es válido');
    }

    changes.activo = data.activo;
  }

  return usuarioRepository.update(id, changes);
}

export async function remove(id: number) {
  const usuario = await usuarioRepository.findById(id);

  if (!usuario) {
    throw new Error('Usuario no encontrado');
  }

  return usuarioRepository.remove(id);
}
