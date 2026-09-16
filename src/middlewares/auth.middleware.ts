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

function readSession(payload: string | jwt.JwtPayload) {
  if (typeof payload !== 'object') return null;

  const id = payload.id;

  if (!Number.isInteger(id) || id <= 0) return null;

  return {
    userId: id as number,
    issuedAt: typeof payload.iat === 'number' ? payload.iat : null,
  };
}

/**
 * Una sesión emitida antes del último cambio de contraseña ya no vale: así,
 * cambiar la contraseña cierra las sesiones abiertas en otros dispositivos.
 * `iat` está en segundos; el cambio se guarda redondeado al segundo.
 */
function issuedBeforePasswordChange(
  issuedAt: number | null,
  passwordChangedAt: Date | null,
) {
  if (!passwordChangedAt) return false;

  return issuedAt === null || issuedAt * 1000 < passwordChangedAt.getTime();
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

  let session: ReturnType<typeof readSession>;

  try {
    // Fijar el algoritmo evita que un token firmado de otra forma se acepte.
    session = readSession(jwt.verify(token, secret, { algorithms: ['HS256'] }));
  } catch {
    session = null;
  }

  if (!session) {
    clearSessionCookie(res);

    return res.status(401).json({
      message: 'Sesión inválida o expirada',
    });
  }

  try {
    const user = await userRepository.findSessionUser(session.userId);

    if (
      !user ||
      !user.activo ||
      issuedBeforePasswordChange(session.issuedAt, user.passwordActualizada)
    ) {
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

export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({ message: 'No autenticado' });
  }

  if (req.user.tipo !== 'ADMIN') {
    return res.status(403).json({ message: 'Acceso no autorizado' });
  }

  next();
}
