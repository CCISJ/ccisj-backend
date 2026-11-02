import argon2 from 'argon2';

import type { PrismaClient } from '../../src/generated/prisma/client';

export async function seedUsers(prisma: PrismaClient) {
  const password = await argon2.hash('1234');
  const [admin, usuarioSocio, usuarioDirectivo, usuarioPostulante] =
    await Promise.all([
      prisma.usuario.upsert({
        where: { email: 'admin@ccisj.uy' },
        update: {
          password,
          tipo: 'ADMIN',
          activo: true,
        },
        create: {
          email: 'admin@ccisj.uy',
          password,
          tipo: 'ADMIN',
        },
      }),

      prisma.usuario.upsert({
        where: { email: 'empresa@ccisj.uy' },
        update: {
          password,
          tipo: 'SOCIO',
          activo: true,
        },
        create: {
          email: 'empresa@ccisj.uy',
          password,
          tipo: 'SOCIO',
        },
      }),

      prisma.usuario.upsert({
        where: { email: 'directivo@ccisj.uy' },
        update: {
          password,
          tipo: 'SOCIO',
          activo: true,
        },
        create: {
          email: 'directivo@ccisj.uy',
          password,
          tipo: 'SOCIO',
        },
      }),

      prisma.usuario.upsert({
        where: { email: 'postulante@ccisj.uy' },
        update: {
          password,
          tipo: 'POSTULANTE',
          activo: true,
        },
        create: {
          email: 'postulante@ccisj.uy',
          password,
          tipo: 'POSTULANTE',
        },
      }),
    ]);
  return { admin, usuarioSocio, usuarioDirectivo, usuarioPostulante };
}
