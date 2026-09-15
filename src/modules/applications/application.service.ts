import * as applicationRepository from './application.repository';

import * as offerRepository from '@/modules/offers/offer.repository';

import * as applicantRepository from '@/modules/applicants/applicant.repository';

import type { SessionUser } from '@/middlewares/auth.middleware';
import { HttpError } from '@/utils/http-error';

import {
  CreateApplicationData,
  ApplicationStatus,
  UpdateApplicationData,
} from '@/types/application.type';

const APPLICATION_STATES: ApplicationStatus[] = [
  'ENVIADA',
  'EN_REVISION',
  'SELECCIONADO',
  'NO_SELECCIONADO',
  'FINALIZADA',
];

type Application = NonNullable<
  Awaited<ReturnType<typeof applicationRepository.findById>>
>;

function canView(application: Application, actor: SessionUser) {
  switch (actor.tipo) {
    case 'ADMIN':
      return true;

    case 'SOCIO':
      return application.oferta.socioId === actor.socioId;

    case 'POSTULANTE':
      return application.postulanteId === actor.postulanteId;

    default:
      return false;
  }
}

/**
 * La postulación, si el usuario tiene acceso. Si no lo tiene se responde como
 * si no existiera, para no revelar qué IDs hay.
 */
async function findAccessible(id: number, actor: SessionUser) {
  const application = await applicationRepository.findById(id);

  if (!application || !canView(application, actor)) {
    throw new HttpError(404, 'Postulación no encontrada');
  }

  return application;
}

export async function getAll() {
  return applicationRepository.findAll();
}

export async function getById(id: number, actor: SessionUser) {
  return findAccessible(id, actor);
}

export async function create(data: CreateApplicationData, actor: SessionUser) {
  // El postulante es siempre el de la sesión: si viniera del body, cualquiera
  // podría postular a otra persona.
  const postulanteId = actor.postulanteId;

  if (!postulanteId) {
    throw new Error('El usuario no tiene un perfil de postulante');
  }

  if (!data.ofertaId) {
    throw new Error('Faltan datos obligatorios');
  }

  if (!Number.isInteger(data.ofertaId)) {
    throw new Error('La oferta no es válida');
  }

  if (
    data.observaciones !== undefined &&
    typeof data.observaciones !== 'string'
  ) {
    throw new Error('El campo observaciones no es válido');
  }

  const offer = await offerRepository.findById(data.ofertaId);

  if (!offer) {
    throw new Error('Oferta no encontrada');
  }

  // Una oferta con la fecha de cierre vencida está cerrada aunque todavía
  // figure como activa en la base (se cierra sola en la próxima lectura).
  if (
    offer.estado !== 'ACTIVA' ||
    (offer.fechaCierre && offer.fechaCierre < new Date())
  ) {
    throw new Error('La oferta no está activa');
  }

  const applicant = await applicantRepository.findById(postulanteId);

  if (!applicant) {
    throw new Error('Postulante no encontrado');
  }

  if (applicant.cvs.length === 0) {
    throw new Error('El postulante debe tener un CV cargado');
  }

  const existingApplication =
    await applicationRepository.findByOfferAndApplicant(
      data.ofertaId,
      postulanteId,
    );

  if (existingApplication) {
    throw new Error('El postulante ya se postuló a esta oferta');
  }

  return applicationRepository.create({
    ofertaId: data.ofertaId,
    postulanteId,
    observaciones: data.observaciones?.trim(),
  });
}

export async function update(
  id: number,
  data: UpdateApplicationData,
  actor: SessionUser,
) {
  await findAccessible(id, actor);

  if (data.estado !== undefined && !APPLICATION_STATES.includes(data.estado)) {
    throw new Error('El estado de la postulación no es válido');
  }

  if (
    data.observaciones !== undefined &&
    typeof data.observaciones !== 'string'
  ) {
    throw new Error('El campo observaciones no es válido');
  }

  return applicationRepository.update(id, {
    estado: data.estado,
    observaciones: data.observaciones,
  });
}

export async function remove(id: number, actor: SessionUser) {
  await findAccessible(id, actor);

  return applicationRepository.remove(id);
}
