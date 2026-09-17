import type { SessionUser } from '@/middlewares/auth.middleware';
import * as categoryRepository from '@/modules/categories/category.repository';
import * as memberRepository from '@/modules/members/member.repository';
import {
  CreateOfferData,
  OFFER_MODALITIES,
  OFFER_STATES,
  OfferModality,
  OfferStatus,
  UpdateOfferData,
} from '@/types/offer.type';
import { HttpError } from '@/utils/http-error';

import * as offerRepository from './offer.repository';

// Límites de largo: la base acepta hasta 255 caracteres en título y ubicación
// y la descripción no tiene tope; sin esto un texto largo terminaba en un 500.
const TITLE_MAX = 150;
const LOCATION_MAX = 150;
const DESCRIPTION_MAX = 5000;
const VACANCIES_MAX = 999;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Uruguay no tiene horario de verano desde 2015: la hora local es siempre
// UTC-3. Una oferta que cierra el 30/09 recibe postulaciones hasta las
// 23:59:59 de ese día en San José, sin importar dónde corra el servidor.
const URUGUAY_OFFSET = '-03:00';

/**
 * Pasada la fecha de cierre, la oferta se cierra sola. No hay un proceso que
 * lo haga a la hora exacta: se aplica antes de cada lectura o modificación,
 * así nadie ve (ni se postula a) una oferta vencida como si estuviera activa.
 */
async function closeExpired() {
  await offerRepository.closeExpired(new Date());
}

export async function getAll() {
  await closeExpired();

  return offerRepository.findAll();
}

export async function getById(id: number) {
  await closeExpired();

  const offer = await offerRepository.findById(id);

  if (!offer) {
    throw new HttpError(404, 'Oferta no encontrada');
  }

  return offer;
}

/** Las ofertas de la empresa del socio, con cuántas postulaciones tiene cada una. */
export async function getMine(actor: SessionUser) {
  if (!actor.socioId) {
    throw new HttpError(404, 'Socio no encontrado');
  }

  await closeExpired();

  return offerRepository.findBySocio(actor.socioId);
}

export async function getMineById(id: number, actor: SessionUser) {
  if (!actor.socioId) {
    throw new HttpError(404, 'Oferta no encontrada');
  }

  await closeExpired();

  const offer = await offerRepository.findOwnById(id, actor.socioId);

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

function assertObject(body: unknown): asserts body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Datos inválidos');
  }
}

/**
 * Categorías de la oferta: al menos una, todas existentes y activas. Una
 * categoría que la administración desactivó no se puede elegir de nuevo, pero
 * la oferta que ya la tenía la conserva al editarse.
 */
async function parseCategories(
  categoryIds: unknown,
  currentIds: number[] = [],
) {
  if (
    !Array.isArray(categoryIds) ||
    !categoryIds.every((id) => Number.isInteger(id) && id > 0)
  ) {
    throw new HttpError(400, 'Las categorías no son válidas');
  }

  if (categoryIds.length === 0) {
    throw new HttpError(400, 'La oferta debe tener al menos una categoría');
  }

  const uniqueIds = [...new Set(categoryIds as number[])];

  const categories = await categoryRepository.findByIds(uniqueIds);

  if (categories.length !== uniqueIds.length) {
    throw new HttpError(400, 'Una o más categorías no existen');
  }

  const inactive = categories.find(
    (category) => !category.activa && !currentIds.includes(category.id),
  );

  if (inactive) {
    throw new HttpError(
      400,
      `La categoría ${inactive.nombre} ya no está disponible`,
    );
  }

  return uniqueIds;
}

function parseTitle(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'El título es obligatorio');
  }

  const title = value.trim();

  if (title.length > TITLE_MAX) {
    throw new HttpError(
      400,
      `El título no puede superar los ${TITLE_MAX} caracteres`,
    );
  }

  return title;
}

function parseDescription(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'La descripción es obligatoria');
  }

  const description = value.trim();

  if (description.length > DESCRIPTION_MAX) {
    throw new HttpError(
      400,
      `La descripción no puede superar los ${DESCRIPTION_MAX} caracteres`,
    );
  }

  return description;
}

/** Ubicación opcional: vacía o null la borra. */
function parseLocation(value: unknown) {
  if (value === null) return null;

  if (typeof value !== 'string') {
    throw new HttpError(400, 'La ubicación no es válida');
  }

  const location = value.trim();

  if (location.length > LOCATION_MAX) {
    throw new HttpError(
      400,
      `La ubicación no puede superar los ${LOCATION_MAX} caracteres`,
    );
  }

  return location || null;
}

/** Modalidad opcional: una de la lista, o vacía/null para quitarla. */
function parseModality(value: unknown): OfferModality | null {
  if (value === null || value === '') return null;

  if (!OFFER_MODALITIES.includes(value as OfferModality)) {
    throw new HttpError(400, 'La modalidad no es válida');
  }

  return value as OfferModality;
}

function parseVacancies(value: unknown) {
  if (
    !Number.isInteger(value) ||
    (value as number) < 1 ||
    (value as number) > VACANCIES_MAX
  ) {
    throw new HttpError(
      400,
      `La cantidad de vacantes debe estar entre 1 y ${VACANCIES_MAX}`,
    );
  }

  return value as number;
}

function parseStatus(value: unknown) {
  if (!OFFER_STATES.includes(value as OfferStatus)) {
    throw new HttpError(400, 'El estado de la oferta no es válido');
  }

  return value as OfferStatus;
}

/**
 * Fecha de cierre como día ("AAAA-MM-DD"), o null para dejar la oferta sin
 * fecha. Se guarda el último instante de ese día en Uruguay y no puede quedar
 * en el pasado: una oferta nueva o editada con fecha vencida no tiene sentido.
 */
function parseClosingDate(value: unknown, now: Date) {
  if (value === null || value === '') return null;

  if (typeof value !== 'string' || !DATE_ONLY.test(value)) {
    throw new HttpError(400, 'La fecha de cierre no es válida');
  }

  const date = new Date(`${value}T23:59:59.999${URUGUAY_OFFSET}`);

  // new Date acepta "2026-02-30" y lo corre al 2 de marzo: se compara el día
  // que quedó con el que se pidió.
  const [year, month, day] = value.split('-').map(Number);
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);

  if (
    Number.isNaN(date.getTime()) ||
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() + 1 !== month ||
    local.getUTCDate() !== day
  ) {
    throw new HttpError(400, 'La fecha de cierre no es válida');
  }

  if (date < now) {
    throw new HttpError(400, 'La fecha de cierre no puede ser anterior a hoy');
  }

  return date;
}

export async function create(body: CreateOfferData, actor: SessionUser) {
  assertObject(body);

  // Quién crea la oferta y para qué empresa sale de la sesión, no del body:
  // si no, cualquiera podía publicar a nombre de otro socio.
  const socioId = actor.tipo === 'SOCIO' ? actor.socioId : body.socioId;

  if (!Number.isInteger(socioId) || (socioId as number) <= 0) {
    throw new HttpError(400, 'El socio no es válido');
  }

  const now = new Date();

  const titulo = parseTitle(body.titulo);
  const descripcion = parseDescription(body.descripcion);
  const ubicacion =
    body.ubicacion === undefined ? null : parseLocation(body.ubicacion);
  const modalidad =
    body.modalidad === undefined ? null : parseModality(body.modalidad);
  const cantidadVacantes =
    body.cantidadVacantes === undefined
      ? 1
      : parseVacancies(body.cantidadVacantes);
  const fechaCierre =
    body.fechaCierre === undefined
      ? null
      : parseClosingDate(body.fechaCierre, now);

  const member = await memberRepository.findById(socioId as number);

  if (!member) {
    throw new HttpError(400, 'Socio no encontrado');
  }

  // Al dar de baja un socio se cierran sus ofertas: la administración no le
  // puede publicar una nueva.
  if (!member.usuario.activo) {
    throw new HttpError(
      400,
      'El socio está dado de baja: no puede publicar ofertas',
    );
  }

  const categoriaIds = await parseCategories(body.categoriaIds ?? []);

  // Se publica directo: toda oferta nueva nace activa.
  return offerRepository.create({
    socioId: socioId as number,
    creadaPor: actor.id,
    titulo,
    descripcion,
    ubicacion,
    modalidad,
    cantidadVacantes,
    fechaCierre,
    categoriaIds,
  });
}

export async function update(
  id: number,
  body: UpdateOfferData,
  actor: SessionUser,
) {
  assertObject(body);

  await closeExpired();

  const offer = await findEditableOffer(id, actor);
  const now = new Date();

  const changes: offerRepository.UpdateOfferData = {};

  if (body.titulo !== undefined) changes.titulo = parseTitle(body.titulo);

  if (body.descripcion !== undefined) {
    changes.descripcion = parseDescription(body.descripcion);
  }

  if (body.ubicacion !== undefined) {
    changes.ubicacion = parseLocation(body.ubicacion);
  }

  if (body.modalidad !== undefined) {
    changes.modalidad = parseModality(body.modalidad);
  }

  if (body.cantidadVacantes !== undefined) {
    changes.cantidadVacantes = parseVacancies(body.cantidadVacantes);
  }

  if (body.fechaCierre !== undefined) {
    changes.fechaCierre = parseClosingDate(body.fechaCierre, now);
  }

  if (body.estado !== undefined) {
    changes.estado = parseStatus(body.estado);
  }

  if (body.categoriaIds !== undefined) {
    changes.categoriaIds = await parseCategories(
      body.categoriaIds,
      offer.categorias.map(({ categoriaId }) => categoriaId),
    );
  }

  // Reabrir una oferta vencida sin moverle la fecha la volvería a cerrar en
  // la próxima lectura: se pide una fecha nueva (o quitarla) en el mismo cambio.
  const closingDate =
    changes.fechaCierre !== undefined ? changes.fechaCierre : offer.fechaCierre;

  if (changes.estado === 'ACTIVA' && closingDate && closingDate < now) {
    throw new HttpError(
      400,
      'Para reabrir la oferta, elegí una fecha de cierre a partir de hoy o quitala',
    );
  }

  // Las ofertas de un socio dado de baja quedan cerradas (el socio ya no
  // entra, así que esto solo lo puede intentar la administración).
  if (changes.estado === 'ACTIVA' && offer.estado !== 'ACTIVA') {
    const member = await memberRepository.findById(offer.socioId);

    if (!member?.usuario.activo) {
      throw new HttpError(
        400,
        'El socio está dado de baja: no se puede reabrir la oferta',
      );
    }
  }

  return offerRepository.update(id, changes);
}

/**
 * Solo se borra una oferta sin postulaciones: en la base las postulaciones
 * se borran en cascada con la oferta y el postulante perdería su historial.
 * Una oferta con postulaciones se cierra.
 */
export async function remove(id: number, actor: SessionUser) {
  await findEditableOffer(id, actor);

  const result = await offerRepository.removeIfNoApplications(id);

  if (result === 'not-found') {
    throw new HttpError(404, 'Oferta no encontrada');
  }

  if (result === 'has-applications') {
    throw new HttpError(
      409,
      'No se puede eliminar una oferta que ya recibió postulaciones. Podés cerrarla.',
    );
  }
}
