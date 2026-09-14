import * as offerRepository from './offer.repository';
import * as memberRepository from '@/modules/members/member.repository';
import * as categoryRepository from '@/modules/categories/category.repository';
import type { SessionUser } from '@/middlewares/auth.middleware';
import { HttpError } from '@/utils/http-error';
import { CreateOfferData, UpdateOfferData } from '@/types/offer.type';

const OFFER_STATES = ['ACTIVA', 'CERRADA'] as const;

export async function getAll() {
  return offerRepository.findAll();
}

export async function getById(id: number) {
  const offer = await offerRepository.findById(id);

  if (!offer) {
    throw new HttpError(404, 'Oferta no encontrada');
  }

  return offer;
}

/**
 * La oferta, si el usuario puede modificarla. A un socio que pide una oferta
 * de otra empresa se le responde igual que si no existiera.
 */
async function findEditableOffer(id: number, actor: SessionUser) {
  const offer = await offerRepository.findById(id);

  if (!offer) {
    throw new HttpError(404, 'Oferta no encontrada');
  }

  if (actor.tipo === 'SOCIO' && offer.socioId !== actor.socioId) {
    throw new HttpError(404, 'Oferta no encontrada');
  }

  return offer;
}

async function validateCategories(categoryIds: unknown) {
  if (
    !Array.isArray(categoryIds) ||
    !categoryIds.every((id) => Number.isInteger(id) && id > 0)
  ) {
    throw new Error('Las categorías no son válidas');
  }

  if (categoryIds.length === 0) {
    throw new Error('La oferta debe tener al menos una categoría');
  }

  const uniqueIds = [...new Set(categoryIds as number[])];

  const categories = await categoryRepository.findByIds(uniqueIds);

  if (categories.length !== uniqueIds.length) {
    throw new Error('Una o más categorías no existen');
  }

  return uniqueIds;
}

function optionalText(value: unknown, field: string) {
  if (value === undefined) return undefined;

  if (typeof value !== 'string') {
    throw new Error(`El campo ${field} no es válido`);
  }

  return value.trim();
}

function parseVacancies(value: unknown) {
  if (value === undefined) return undefined;

  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error('La cantidad de vacantes debe ser mayor a 0');
  }

  return value as number;
}

function parseClosingDate(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const date = typeof value === 'string' ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    throw new Error('La fecha de cierre no es válida');
  }

  return date;
}

export async function create(data: CreateOfferData, actor: SessionUser) {
  // Quién crea la oferta y para qué empresa sale de la sesión, no del body:
  // si no, cualquiera podía publicar a nombre de otro socio.
  const socioId = actor.tipo === 'SOCIO' ? actor.socioId : data.socioId;

  if (!socioId || !data.titulo || !data.descripcion) {
    throw new Error('Faltan datos obligatorios');
  }

  if (!Number.isInteger(socioId)) {
    throw new Error('El socio no es válido');
  }

  const titulo = optionalText(data.titulo, 'titulo');
  const descripcion = optionalText(data.descripcion, 'descripcion');

  if (!titulo || !descripcion) {
    throw new Error('Faltan datos obligatorios');
  }

  const cantidadVacantes = parseVacancies(data.cantidadVacantes);

  const member = await memberRepository.findById(socioId);

  if (!member) {
    throw new Error('Socio no encontrado');
  }

  const categoriaIds = await validateCategories(data.categoriaIds ?? []);

  return offerRepository.create({
    socioId,
    creadaPor: actor.id,
    titulo,
    descripcion,
    ubicacion: optionalText(data.ubicacion, 'ubicacion'),
    modalidad: optionalText(data.modalidad, 'modalidad'),
    cantidadVacantes,
    fechaCierre: parseClosingDate(data.fechaCierre) ?? undefined,
    categoriaIds,
  });
}

export async function update(
  id: number,
  data: UpdateOfferData,
  actor: SessionUser,
) {
  await findEditableOffer(id, actor);

  const cantidadVacantes = parseVacancies(data.cantidadVacantes);

  if (
    data.estado !== undefined &&
    !OFFER_STATES.includes(data.estado as (typeof OFFER_STATES)[number])
  ) {
    throw new Error('El estado de la oferta no es válido');
  }

  const titulo = optionalText(data.titulo, 'titulo');
  const descripcion = optionalText(data.descripcion, 'descripcion');

  if (titulo === '' || descripcion === '') {
    throw new Error('Título y descripción no pueden quedar vacíos');
  }

  let categoriaIds: number[] | undefined;

  if (data.categoriaIds !== undefined) {
    categoriaIds = await validateCategories(data.categoriaIds);
  }

  return offerRepository.update(id, {
    titulo,
    descripcion,
    ubicacion: optionalText(data.ubicacion, 'ubicacion'),
    modalidad: optionalText(data.modalidad, 'modalidad'),
    cantidadVacantes,
    estado: data.estado,
    fechaCierre: parseClosingDate(data.fechaCierre),
    categoriaIds,
  });
}

export async function remove(id: number, actor: SessionUser) {
  await findEditableOffer(id, actor);

  return offerRepository.remove(id);
}
