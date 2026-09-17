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

// Postulaciones que la empresa todavía no resolvió. Con la baja ya nadie las va
// a revisar; las seleccionadas o no seleccionadas quedan como están.
const OPEN_APPLICATION_STATES = ['ENVIADA', 'EN_REVISION'] as const;

type ClosedOfferNotice = (offerTitle: string) => {
  titulo: string;
  mensaje: string;
};

/**
 * Baja lógica del socio: se desactiva la cuenta, sus ofertas activas se cierran
 * y las postulaciones sin resolver pasan a FINALIZADA, con un aviso por oferta a
 * los postulantes activos. Todo en una transacción: se aplica completo o nada.
 * Si después se reactiva la cuenta, las ofertas siguen cerradas.
 */
export function remove(
  id: number,
  usuarioId: number,
  closedOfferNotice: ClosedOfferNotice,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          activo: false,
        },
      });

      await tx.oferta.updateMany({
        where: { socioId: id, estado: 'ACTIVA' },
        data: { estado: 'CERRADA' },
      });

      const finalized = await tx.postulacion.updateManyAndReturn({
        where: {
          estado: { in: [...OPEN_APPLICATION_STATES] },
          oferta: { socioId: id },
        },
        data: { estado: 'FINALIZADA' },
        select: { ofertaId: true, postulanteId: true },
      });

      if (finalized.length === 0) return;

      const offers = await tx.oferta.findMany({
        where: { id: { in: [...new Set(finalized.map((a) => a.ofertaId))] } },
        select: { id: true, titulo: true },
      });

      // A un postulante desactivado no se le crea el aviso, igual que cuando
      // la empresa cambia un estado.
      const recipients = await tx.postulante.findMany({
        where: {
          id: { in: [...new Set(finalized.map((a) => a.postulanteId))] },
          usuario: { activo: true },
        },
        select: { id: true, usuarioId: true },
      });

      const userByApplicant = new Map(
        recipients.map((r) => [r.id, r.usuarioId]),
      );

      for (const offer of offers) {
        const userIds = finalized
          .filter((a) => a.ofertaId === offer.id)
          .map((a) => userByApplicant.get(a.postulanteId))
          .filter((userId) => userId !== undefined);

        if (userIds.length === 0) continue;

        await tx.notificacion.create({
          data: {
            ...closedOfferNotice(offer.titulo),
            tipo: 'NORMAL',
            // Es un aviso automático de la empresa, no un envío del admin: así
            // no aparece entre las notificaciones que ve la administración.
            creadoPorId: usuarioId,
            destinatarios: {
              create: userIds.map((userId) => ({ usuarioId: userId })),
            },
          },
        });
      }
    },
    // Una empresa con muchas ofertas son varias consultas contra la base remota.
    { timeout: 15_000 },
  );
}
