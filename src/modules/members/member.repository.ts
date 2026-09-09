import { prisma } from '@/config/prisma';
import { CreateMemberData } from '@/types/member.type';

export function findAll() {
  return prisma.socio.findMany({
    include: {
      usuario: {
        select: {
          id: true,
          email: true,
          activo: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  });
}

export function findById(id: number) {
  return prisma.socio.findUnique({
    where: { id },
    include: {
      usuario: {
        select: {
          id: true,
          email: true,
          activo: true,
        },
      },
    },
  });
}

export function findByRut(rut: string) {
  return prisma.socio.findUnique({
    where: { rut },
  });
}

export function createWithUser(
  data: CreateMemberData,
  passwordInicial: string,
) {
  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        email: data.email,
        password: passwordInicial,
        tipo: 'SOCIO',
      },
      select: {
        id: true,
        email: true,
        tipo: true,
        activo: true,
        fechaCreacion: true,
      },
    });

    const socio = await tx.socio.create({
      data: {
        usuarioId: usuario.id,
        razonSocial: data.razonSocial,
        titular: data.titular,
        giroComercial: data.giroComercial,
        tipo: data.tipo,
        rut: data.rut,
        numeroBps: data.numeroBps,
        fechaInicioEmpresa: data.fechaInicioEmpresa,
        fechaAfiliacion: data.fechaAfiliacion,
        direccion: data.direccion,
        ciudad: data.ciudad,
        celular: data.celular,
        telefono: data.telefono,
        email: data.email,
        observaciones: data.observaciones,
      },
      include: {
        usuario: {
          select: {
            id: true,
            email: true,
            activo: true,
          },
        },
      },
    });

    return socio;
  });
}

export function update(
  id: number,
  usuarioId: number,
  data: Partial<CreateMemberData>,
) {
  return prisma.$transaction(async (tx) => {
    if (data.email) {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          email: data.email,
        },
      });
    }

    return tx.socio.update({
      where: { id },
      data,
      include: {
        usuario: {
          select: {
            id: true,
            email: true,
            activo: true,
          },
        },
      },
    });
  });
}

export function remove(id: number, usuarioId: number) {
  return prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuarioId },
      data: {
        activo: false,
      },
    });
  });
}
