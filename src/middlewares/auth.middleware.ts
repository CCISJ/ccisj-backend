import type { MemberType } from '@/types/member.type';
import type { TipoUsuario } from '@/types/user.type';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import * as userRepository from '@/modules/users/user.repository';
import { clearSessionCookie } from '@/modules/auth/session-cookie';

/**
 * Usuario de la sesión, leído de la base en cada request. El token solo
 * identifica a quién pertenece la sesión: el rol, si sigue activo y a qué
 * perfil corresponde se consultan en el momento, así que desactivar a alguien
 * o cambiarle el rol tiene efecto inmediato y no recién cuando vence el token.
 */
export type SessionUser = {
  id: number;
  tipo: TipoUsuario;
  socioId: number | null;
  memberType: MemberType | null;
  postulanteId: number | null;
};

export type AuthRequest = Request & {
  user?: SessionUser;
};

function readUserId(payload: string | jwt.JwtPayload) {
  if (typeof payload !== 'object') return null;

  const id = payload.id;

  return Number.isInteger(id) && id > 0 ? (id as number) : null;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.token;

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

  let userId: number | null;

  try {
    // Fijar el algoritmo evita que un token firmado de otra forma se acepte.
    userId = readUserId(jwt.verify(token, secret, { algorithms: ['HS256'] }));
  } catch {
    userId = null;
  }

  if (!userId) {
    clearSessionCookie(res);

    return res.status(401).json({
      message: 'Sesión inválida o expirada',
    });
  }

  try {
    const user = await userRepository.findSessionUser(userId);

    if (!user || !user.activo) {
      clearSessionCookie(res);

      return res.status(401).json({
        message: 'Sesión inválida o expirada',
      });
    }

    req.user = {
      id: user.id,
      tipo: user.tipo,
      socioId: user.socio?.id ?? null,
      memberType: user.socio?.tipo ?? null,
      postulanteId: user.postulante?.id ?? null,
    };

    next();
  } catch {
    return res.status(500).json({
      message: 'No se pudo verificar la sesión',
    });
  }
}

const FORBIDDEN_MESSAGE = 'No tiene permiso para realizar esta acción';

/**
 * Deja pasar solo a los roles indicados. Va siempre después de `requireAuth`.
 */
export function requireRole(...roles: TipoUsuario[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'No autenticado',
      });
    }

    if (!roles.includes(req.user.tipo)) {
      return res.status(403).json({
        message: FORBIDDEN_MESSAGE,
      });
    }

    next();
  };
}

/**
 * El administrador y los socios directivos. Un socio común queda afuera.
 */
export function requireAdminOrDirectivo(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      message: 'No autenticado',
    });
  }

  const isDirectivo = user.tipo === 'SOCIO' && user.memberType === 'DIRECTIVO';

  if (user.tipo !== 'ADMIN' && !isDirectivo) {
    return res.status(403).json({
      message: FORBIDDEN_MESSAGE,
    });
  }

  next();
}
