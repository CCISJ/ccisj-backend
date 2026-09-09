import type { Request, Response } from 'express';

import * as authService from './auth.service';
import { AuthRequest } from '@/middlewares/auth.middleware';

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email y contraseña son obligatorios',
      });
    }

    const result = await authService.login({
      email,
      password,
    });

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      user: result.user,
    });
  } catch (error) {
    return res.status(401).json({
      message:
        error instanceof Error ? error.message : 'Error al iniciar sesión',
    });
  }
}

export async function me(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    const user = await authService.me(req.user.id);

    return res.status(200).json({
      user,
    });
  } catch (error) {
    return res.status(401).json({
      message:
        error instanceof Error
          ? error.message
          : 'No se pudo obtener el usuario',
    });
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  return res.status(200).json({
    message: 'Sesión cerrada correctamente',
  });
}
