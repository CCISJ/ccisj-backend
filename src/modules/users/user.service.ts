import { TipoUsuario } from '@/types/user.type';
import * as usuarioRepository from './user.repository';

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
  email: string;
  password: string;
  tipo: TipoUsuario;
}) {
  if (!data.email || !data.password || !data.tipo) {
    throw new Error('Faltan datos obligatorios');
  }

  const existingUser = await usuarioRepository.findByEmail(data.email);

  if (existingUser) {
    throw new Error('El email ya está registrado');
  }

  return usuarioRepository.create(data);
}

export async function update(
  id: number,
  data: {
    email?: string;
    tipo?: TipoUsuario;
    activo?: boolean;
  },
) {
  const usuario = await usuarioRepository.findById(id);

  if (!usuario) {
    throw new Error('Usuario no encontrado');
  }

  if (data.email) {
    const existingUser = await usuarioRepository.findByEmail(data.email);

    if (existingUser && existingUser.id !== id) {
      throw new Error('El email ya está registrado');
    }
  }

  return usuarioRepository.update(id, data);
}

export async function remove(id: number) {
  const usuario = await usuarioRepository.findById(id);

  if (!usuario) {
    throw new Error('Usuario no encontrado');
  }

  return usuarioRepository.remove(id);
}
