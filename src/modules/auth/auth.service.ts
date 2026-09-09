import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

import * as usuarioRepository from '@/modules/users/user.repository';

type LoginData = {
  email: string;
  password: string;
};

export async function login(data: LoginData) {
  const user = await usuarioRepository.findByEmail(data.email);

  if (!user) {
    throw new Error('Credenciales inválidas');
  }

  if (!user.activo) {
    throw new Error('Usuario inactivo');
  }

  const passwordOk = await argon2.verify(user.password, data.password);

  if (!passwordOk) {
    throw new Error('Credenciales inválidas');
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET no configurado');
  }

  const token = jwt.sign(
    {
      id: user.id,
      tipo: user.tipo,
    },
    secret,
    {
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
  const user = await usuarioRepository.findById(userId);

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  if (!user.activo) {
    throw new Error('Usuario inactivo');
  }

  return {
    id: user.id,
    email: user.email,
    tipo: user.tipo,
    memberType: user.socio?.tipo ?? null,
  };
}
