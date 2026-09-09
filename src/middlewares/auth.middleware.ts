import { TipoUsuario } from '@/types/user.type';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

type JwtPayload = {
  id: number;
  tipo: TipoUsuario;
};

export type AuthRequest = Request & {
  user?: JwtPayload;
};

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      message: 'No autenticado',
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({
      message: 'JWT_SECRET no configurado',
    });
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      message: 'Sesión inválida o expirada',
    });
  }
}
