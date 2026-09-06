import * as offerRepository from './offer.repository';
import * as memberRepository from '@/modules/members/member.repository';
import * as userRepository from '@/modules/users/user.repository';
import * as categoryRepository from '@/modules/categories/category.repository';
import { CreateOfferData, UpdateOfferData } from '@/types/offer.type';

export async function getAll() {
  return offerRepository.findAll();
}

export async function getById(id: number) {
  const offer = await offerRepository.findById(id);

  if (!offer) {
    throw new Error('Oferta no encontrada');
  }

  return offer;
}

async function validateCategories(categoryIds: number[]) {
  if (categoryIds.length === 0) {
    throw new Error('La oferta debe tener al menos una categoría');
  }

  const uniqueIds = [...new Set(categoryIds)];

  const categories = await categoryRepository.findByIds(uniqueIds);

  if (categories.length !== uniqueIds.length) {
    throw new Error('Una o más categorías no existen');
  }

  return uniqueIds;
}

export async function create(data: CreateOfferData) {
  if (!data.socioId || !data.creadaPor || !data.titulo || !data.descripcion) {
    throw new Error('Faltan datos obligatorios');
  }

  if (data.cantidadVacantes !== undefined && data.cantidadVacantes <= 0) {
    throw new Error('La cantidad de vacantes debe ser mayor a 0');
  }

  const member = await memberRepository.findById(data.socioId);

  if (!member) {
    throw new Error('Socio no encontrado');
  }

  const creator = await userRepository.findById(data.creadaPor);

  if (!creator) {
    throw new Error('Usuario creador no encontrado');
  }

  if (creator.tipo === 'POSTULANTE') {
    throw new Error('Un postulante no puede crear ofertas');
  }

  // Un socio solamente puede crear ofertas para sí mismo.
  if (creator.tipo === 'SOCIO' && member.usuarioId !== creator.id) {
    throw new Error('El socio solo puede crear ofertas para su propia empresa');
  }

  const categoriaIds = await validateCategories(data.categoriaIds ?? []);

  return offerRepository.create({
    socioId: data.socioId,
    creadaPor: data.creadaPor,
    titulo: data.titulo,
    descripcion: data.descripcion,
    ubicacion: data.ubicacion,
    modalidad: data.modalidad,
    cantidadVacantes: data.cantidadVacantes,
    fechaCierre: data.fechaCierre ? new Date(data.fechaCierre) : undefined,
    categoriaIds,
  });
}

export async function update(id: number, data: UpdateOfferData) {
  const offer = await offerRepository.findById(id);

  if (!offer) {
    throw new Error('Oferta no encontrada');
  }

  if (data.cantidadVacantes !== undefined && data.cantidadVacantes <= 0) {
    throw new Error('La cantidad de vacantes debe ser mayor a 0');
  }

  let categoriaIds: number[] | undefined;

  if (data.categoriaIds) {
    categoriaIds = await validateCategories(data.categoriaIds);
  }

  return offerRepository.update(id, {
    titulo: data.titulo,
    descripcion: data.descripcion,
    ubicacion: data.ubicacion,
    modalidad: data.modalidad,
    cantidadVacantes: data.cantidadVacantes,
    estado: data.estado,

    fechaCierre:
      data.fechaCierre === null
        ? null
        : data.fechaCierre
          ? new Date(data.fechaCierre)
          : undefined,

    categoriaIds,
  });
}

export async function remove(id: number) {
  const offer = await offerRepository.findById(id);

  if (!offer) {
    throw new Error('Oferta no encontrada');
  }

  return offerRepository.remove(id);
}
