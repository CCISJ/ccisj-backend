/**
 * Utilidades para los tests: crean usuarios de cada rol directamente en la
 * base y les arman la cookie de sesión.
 *
 * La base es compartida con el resto del equipo, así que todo lo que se crea
 * lleva un sufijo único y se borra por ID al terminar. Nunca borrar sin filtro.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { prisma } from '@/config/prisma';
import type { MemberType } from '@/types/member.type';

export function uniqueSuffix() {
  return `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Número de BPS válido (12 dígitos) y prácticamente único, para no chocar
 * con los socios reales de la base compartida.
 */
export function uniqueBps() {
  const random = crypto.randomInt(0, 1000).toString().padStart(3, '0');

  return `${Date.now()}`.slice(-9) + random;
}

/** Cookie de sesión válida para el usuario, como la que deja el login. */
export function sessionCookie(userId: number) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('Los tests necesitan JWT_SECRET en el .env');
  }

  const token = jwt.sign({ id: userId }, secret, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

  return [`token=${token}`];
}

// Los tests no pasan por el login, así que la contraseña no se usa. Tampoco es
// un hash argon2 válido: si alguna vez se intentara, no autenticaría.
const UNUSABLE_PASSWORD = 'test-sin-login';

export async function createAdmin() {
  const suffix = uniqueSuffix();

  const user = await prisma.usuario.create({
    data: {
      email: `test-admin-${suffix}@ccisj.uy`,
      password: UNUSABLE_PASSWORD,
      tipo: 'ADMIN',
    },
  });

  return { userId: user.id, email: user.email, cookie: sessionCookie(user.id) };
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
    cookie: sessionCookie(user.id),
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
    cookie: sessionCookie(user.id),
  };
}

export async function createCategory() {
  return prisma.categoria.create({
    data: {
      nombre: `Categoría Test ${uniqueSuffix()}`,
    },
  });
}

/**
 * Borra los usuarios de prueba y lo que cuelga de ellos. Las ofertas y las
 * notificaciones no se borran en cascada con el usuario, por eso van primero.
 */
export async function deleteUsers(userIds: number[]) {
  const ids = userIds.filter((id) => Number.isInteger(id) && id > 0);

  if (ids.length === 0) return;

  await prisma.oferta.deleteMany({
    where: {
      OR: [{ creadaPor: { in: ids } }, { socio: { usuarioId: { in: ids } } }],
    },
  });

  await prisma.notificacion.deleteMany({
    where: {
      creadoPorId: { in: ids },
    },
  });

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
