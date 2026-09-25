/**
 * Fixtures/utilidades compartidas para los tests de integración.
 *
 * IMPORTANTE: la base puede ser compartida con el equipo. Todo dato creado por
 * los tests lleva un sufijo único y los helpers de limpieza SIEMPRE borran por ID.
 */
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import request from 'supertest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import type { MemberType } from '../src/types/member.type';
import type { TipoUsuario } from '../src/types/user.type';

export const TEST_PASSWORD = 'Test123456';
const UNUSABLE_PASSWORD = 'test-sin-login';

export function uniqueSuffix() {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export function uniqueEmail(prefix = 'test') {
  return `${prefix}-${uniqueSuffix()}@ccisj.uy`;
}

/** Número de BPS válido (12 dígitos) y prácticamente único. */
export function uniqueBps() {
  const random = crypto.randomInt(0, 1000).toString().padStart(3, '0');
  return `${Date.now()}`.slice(-9) + random;
}

/** Cookie JWT equivalente a la que usa el middleware real. */
export function sessionCookie(userId: number, tipo: TipoUsuario) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Los tests necesitan JWT_SECRET en el .env');

  const token = jwt.sign({ id: userId, tipo }, secret, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

  return [`token=${token}`];
}

type CreateUserOptions = {
  tipo: TipoUsuario;
  activo?: boolean;
  loginEnabled?: boolean;
  email?: string;
  password?: string;
};

/** Crea un Usuario aislado. loginEnabled=true genera un hash Argon2 real. */
export async function createUser({
  tipo,
  activo = true,
  loginEnabled = false,
  email = uniqueEmail(`test-${tipo.toLowerCase()}`),
  password = TEST_PASSWORD,
}: CreateUserOptions) {
  const storedPassword = loginEnabled
    ? await argon2.hash(password)
    : UNUSABLE_PASSWORD;

  const user = await prisma.usuario.create({
    data: { email, password: storedPassword, tipo, activo },
  });

  return {
    userId: user.id,
    email: user.email,
    tipo: user.tipo,
    activo: user.activo,
    password,
    cookie: sessionCookie(user.id, user.tipo),
  };
}

/** Crea un usuario y devuelve un agent autenticado pasando por /auth/login. */
export async function createLoggedUser(
  options: Omit<CreateUserOptions, 'loginEnabled'>,
) {
  const user = await createUser({ ...options, loginEnabled: true });
  const agent = request.agent(app);

  const login = await agent.post('/auth/login').send({
    email: user.email,
    password: user.password,
  });

  if (login.status !== 200) {
    throw new Error(`No se pudo iniciar sesión en fixture (${login.status})`);
  }

  return { ...user, agent };
}

export async function createAdmin() {
  return createUser({ tipo: 'ADMIN' });
}

export async function createMember(tipo: MemberType = 'COMUN') {
  const suffix = uniqueSuffix();
  const email = `test-socio-${suffix}@ccisj.uy`;

  const user = await prisma.usuario.create({
    data: {
      email,
      password: UNUSABLE_PASSWORD,
      tipo: 'SOCIO',
    },
  });

  const socio = await prisma.socio.create({
    data: {
      usuarioId: user.id,
      razonSocial: `Empresa Test ${suffix}`,
      titular: 'Titular Test',
      giroComercial: 'Comercio',
      tipo,
      rut: `TEST-RUT-${suffix}`,
      numeroBps: uniqueBps(),
      fechaInicioEmpresa: new Date('2020-01-01'),
      fechaAfiliacion: new Date('2026-09-01'),
      direccion: '25 de Mayo 123',
      ciudad: 'San José de Mayo',
      celular: '099123456',
      telefono: '43421234',
      email,
      observaciones: 'Observación interna de prueba',
    },
  });

  return {
    userId: user.id,
    socioId: socio.id,
    email,
    tipo: user.tipo,
    memberType: tipo,
    cookie: sessionCookie(user.id, user.tipo),
  };
}

export async function createApplicant({ withCv = true } = {}) {
  const suffix = uniqueSuffix();

  const user = await prisma.usuario.create({
    data: {
      email: `test-postulante-${suffix}@ccisj.uy`,
      password: UNUSABLE_PASSWORD,
      tipo: 'POSTULANTE',
    },
  });

  const postulante = await prisma.postulante.create({
    data: {
      usuarioId: user.id,
      nombre: 'Postulante',
      apellido: `Test ${suffix}`,
      cvs: withCv
        ? {
            create: {
              archivoUrl: '/uploads/cv/test.pdf',
              descripcion: 'CV de prueba',
            },
          }
        : undefined,
    },
  });

  return {
    userId: user.id,
    postulanteId: postulante.id,
    email: user.email,
    tipo: user.tipo,
    cookie: sessionCookie(user.id, user.tipo),
  };
}

export async function createCategory() {
  return prisma.categoria.create({
    data: { nombre: `Categoría Test ${uniqueSuffix()}` },
  });
}

export async function deleteNotificationsCreatedBy(userIds: number[]) {
  const ids = userIds.filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return;

  await prisma.notificacion.deleteMany({
    where: { creadoPorId: { in: ids } },
  });
}

/**
 * Borra usuarios de prueba y dependencias conocidas. Nunca borra datos globales.
 * Las relaciones que tengan cascade se benefician de él; las que bloquean el
 * borrado se limpian antes y siempre filtradas por los IDs recibidos.
 */
export async function deleteUsers(userIds: number[]) {
  const ids = [...new Set(userIds)].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (!ids.length) return;

  await prisma.oferta.deleteMany({
    where: {
      OR: [{ creadaPor: { in: ids } }, { socio: { usuarioId: { in: ids } } }],
    },
  });

  await deleteNotificationsCreatedBy(ids);

  const socios = await prisma.socio.findMany({
    where: {
      usuarioId: { in: ids },
    },
    select: {
      id: true,
    },
  });

  const socioIds = socios.map((socio) => socio.id);

  if (socioIds.length) {
    const cuotas = await prisma.cuota.findMany({
      where: {
        socioId: { in: socioIds },
      },
      select: {
        id: true,
      },
    });

    const cuotaIds = cuotas.map((cuota) => cuota.id);

    const pagos = await prisma.pagoCuota.findMany({
      where: {
        socioId: { in: socioIds },
      },
      select: {
        id: true,
      },
    });

    const pagoIds = pagos.map((pago) => pago.id);

    if (pagoIds.length || cuotaIds.length) {
      await prisma.pagoCuotaDetalle.deleteMany({
        where: {
          OR: [
            ...(pagoIds.length ? [{ pagoId: { in: pagoIds } }] : []),
            ...(cuotaIds.length ? [{ cuotaId: { in: cuotaIds } }] : []),
          ],
        },
      });
    }

    await prisma.pagoCuota.deleteMany({
      where: {
        socioId: { in: socioIds },
      },
    });

    await prisma.cuota.deleteMany({
      where: {
        socioId: { in: socioIds },
      },
    });

    await prisma.ajusteCuotaSocio.deleteMany({
      where: {
        socioId: { in: socioIds },
      },
    });
  }

  await prisma.socio.deleteMany({
    where: {
      usuarioId: { in: ids },
    },
  });

  await prisma.usuario.deleteMany({
    where: {
      id: { in: ids },
    },
  });
}
