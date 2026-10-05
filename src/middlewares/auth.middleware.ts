import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { clearSessionCookie } from '@/modules/auth/session-cookie';
import * as userRepository from '@/modules/users/user.repository';
import type { MemberType } from '@/types/member.type';
import type { TipoUsuario } from '@/types/user.type';

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

/**
 * Resultado de resolver la sesión de un request, sin decidir todavía qué
 * hacer con él: eso lo define cada middleware.
 */
type ResolvedSession =
  | { estado: 'anonimo' }
  | { estado: 'invalida' }
  | { estado: 'sin-secreto' }
  | { estado: 'error' }
  | { estado: 'ok'; user: SessionUser };

/**
 * La verificación completa de una sesión: firma del token, cuenta existente y
 * activa, y contraseña sin cambiar desde que se emitió. Está en un solo lugar
 * porque la usan dos middlewares con políticas distintas (`requireAuth` corta
 * el request, `optionalAuth` sigue como anónimo) y duplicar código de
 * seguridad es la forma más fácil de que las dos copias se vayan separando.
 */
async function resolveSession(req: AuthRequest): Promise<ResolvedSession> {
  const token = req.cookies?.token;

  if (!token) {
    return { estado: 'anonimo' };
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return { estado: 'sin-secreto' };
  }

  let session: ReturnType<typeof readSession>;

  try {
    // Fijar el algoritmo evita que un token firmado de otra forma se acepte.
    session = readSession(jwt.verify(token, secret, { algorithms: ['HS256'] }));
  } catch {
    session = null;
  }

  if (!session) {
    return { estado: 'invalida' };
  }

  try {
    const user = await userRepository.findSessionUser(session.userId);

    if (
      !user ||
      !user.activo ||
      issuedBeforePasswordChange(session.issuedAt, user.passwordActualizada)
    ) {
      return { estado: 'invalida' };
    }

    return {
      estado: 'ok',
      user: {
        id: user.id,
        tipo: user.tipo,
        socioId: user.socio?.id ?? null,
        memberType: user.socio?.tipo ?? null,
        postulanteId: user.postulante?.id ?? null,
      },
    };
  } catch {
    return { estado: 'error' };
  }
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const session = await resolveSession(req);

  switch (session.estado) {
    case 'anonimo':
      return res.status(401).json({
        message: 'No autenticado',
      });

    case 'invalida':
      clearSessionCookie(res);

      return res.status(401).json({
        message: 'Sesión inválida o expirada',
      });

    case 'sin-secreto':
      return res.status(500).json({
        message: 'JWT_SECRET no configurado',
      });

    case 'error':
      return res.status(500).json({
        message: 'No se pudo verificar la sesión',
      });

    default:
      req.user = session.user;

      return next();
  }
}

/**
 * Para los endpoints que contestan con sesión y sin ella: hoy, la bolsa de
 * trabajo pública. Si hay una sesión válida la deja en `req.user` para que el
 * service pueda decidir según el rol; si no hay, el request sigue como
 * anónimo en vez de recibir un 401.
 *
 * Una cookie que ya no sirve (vencida, cuenta desactivada, contraseña
 * cambiada) se borra y el request sigue igual: al visitante solo le interesa
 * ver las ofertas, no enterarse de que su sesión caducó, y si no se borrara el
 * navegador la seguiría mandando en cada pedido.
 */
export async function optionalAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const session = await resolveSession(req);

  switch (session.estado) {
    case 'invalida':
      clearSessionCookie(res);

      return next();

    case 'sin-secreto':
      return res.status(500).json({
        message: 'JWT_SECRET no configurado',
      });

    case 'error':
      return res.status(500).json({
        message: 'No se pudo verificar la sesión',
      });

    case 'ok':
      req.user = session.user;

      return next();

    default:
      return next();
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

export function requireMemberAccess(
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

  const socioId = Number(req.params.socioId);

  if (!Number.isInteger(socioId) || socioId <= 0) {
    return res.status(400).json({
      message: 'El socio no es válido',
    });
  }

  if (user.tipo === 'ADMIN') {
    return next();
  }

  const isDirectivo = user.tipo === 'SOCIO' && user.memberType === 'DIRECTIVO';

  if (isDirectivo) {
    return next();
  }

  const isOwnMember = user.tipo === 'SOCIO' && user.socioId === socioId;

  if (isOwnMember) {
    return next();
  }

  return res.status(403).json({
    message: FORBIDDEN_MESSAGE,
  });
}
