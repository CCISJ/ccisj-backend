import { prisma } from '@/config/prisma';
import { CreateMemberData, OwnEditableField } from '@/types/member.type';

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

// Lo que un socio directivo puede ver de los demás socios. Sin RUT, BPS,
// observaciones internas ni datos de la cuenta, y solo socios activos.
const directorySelect = {
  id: true,
  razonSocial: true,
  titular: true,
  giroComercial: true,
  tipo: true,
  telefono: true,
  celular: true,
  email: true,
  direccion: true,
  ciudad: true,
  fechaAfiliacion: true,
} as const;

export function findDirectory() {
  return prisma.socio.findMany({
    where: {
      usuario: {
        activo: true,
      },
    },
    select: directorySelect,
    orderBy: {
      razonSocial: 'asc',
    },
  });
}

export function findDirectoryEntry(id: number) {
  return prisma.socio.findFirst({
    where: {
      id,
      usuario: {
        activo: true,
      },
    },
    select: directorySelect,
  });
}

// La ficha que ve el propio socio. Todo lo de su empresa menos las
// observaciones, que son notas internas de la administración.
const ownProfileSelect = {
  id: true,
  razonSocial: true,
  titular: true,
  giroComercial: true,
  tipo: true,
  rut: true,
  numeroBps: true,
  fechaInicioEmpresa: true,
  fechaAfiliacion: true,
  direccion: true,
  ciudad: true,
  celular: true,
  telefono: true,
  email: true,
  usuario: {
    select: {
      email: true,
    },
  },
} as const;

export function findOwnProfile(id: number) {
  return prisma.socio.findUnique({
    where: { id },
    select: ownProfileSelect,
  });
}

export function updateOwnProfile(
  id: number,
  data: Partial<Pick<CreateMemberData, OwnEditableField>>,
) {
  // Solo la ficha del socio: el email de acceso (`usuario.email`) no cambia.
  return prisma.socio.update({
    where: { id },
    data,
    select: ownProfileSelect,
  });
}

export function findByRut(rut: string) {
  return prisma.socio.findUnique({
    where: { rut },
  });
}

export function findByNumeroBps(numeroBps: string) {
  return prisma.socio.findUnique({
    where: { numeroBps },
  });
}

export function createWithUser(data: CreateMemberData, hashedPassword: string) {
  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        email: data.email,
        password: hashedPassword,
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
