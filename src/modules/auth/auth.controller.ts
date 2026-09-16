import type { Request, Response } from 'express';

import * as authService from './auth.service';
import { AuthRequest } from '@/middlewares/auth.middleware';
import { clearSessionCookie, setSessionCookie } from './session-cookie';
import { HttpError } from '@/utils/http-error';

export async function login(req: Request, res: Response) {
  try {
    const email = req.body?.email;
    const password = req.body?.password;

    // Si no son texto no llegan a la base: un objeto en `email` se
    // interpretaría como filtro de Prisma.
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: 'Email y contraseña son obligatorios',
      });
    }

    const result = await authService.login({
      email: email.trim(),
      password,
    });

    setSessionCookie(res, result.token);

    return res.status(200).json({
      user: result.user,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: 'Error al iniciar sesión',
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

export async function changePassword(req: AuthRequest, res: Response) {
  try {
    const { token } = await authService.changePassword(req.user!.id, req.body);

    // La sesión actual sigue: recibe un token emitido con el cambio.
    setSessionCookie(res, token);

    return res.status(200).json({
      message: 'Contraseña actualizada',
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: 'Error al cambiar la contraseña',
    });
  }
}

export async function logout(_req: Request, res: Response) {
  clearSessionCookie(res);

  return res.status(200).json({
    message: 'Sesión cerrada correctamente',
  });
}
