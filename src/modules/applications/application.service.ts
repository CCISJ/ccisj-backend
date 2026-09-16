import * as applicationRepository from './application.repository';

import * as offerRepository from '@/modules/offers/offer.repository';

import * as applicantRepository from '@/modules/applicants/applicant.repository';

import type { SessionUser } from '@/middlewares/auth.middleware';
import { HttpError } from '@/utils/http-error';

import {
  CreateApplicationData,
  ApplicationStatus,
  MEMBER_APPLICATION_STATES,
  MemberApplicationStatus,
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

/** Las postulaciones recibidas en las ofertas de la empresa del socio. */
export async function getReceived(actor: SessionUser) {
  if (!actor.socioId) {
    throw new HttpError(404, 'Socio no encontrado');
  }

  return applicationRepository.findReceivedBySocio(actor.socioId);
}

export async function getReceivedById(id: number, actor: SessionUser) {
  const application = actor.socioId
    ? await applicationRepository.findReceivedById(id, actor.socioId)
    : null;

  if (!application) {
    throw new HttpError(404, 'Postulación no encontrada');
  }

  return application;
}

const STATUS_LABELS: Record<MemberApplicationStatus, string> = {
  EN_REVISION: 'En revisión',
  SELECCIONADO: 'Seleccionado',
  NO_SELECCIONADO: 'No seleccionado',
};

function statusMessage(
  estado: MemberApplicationStatus,
  titulo: string,
  empresa: string,
) {
  switch (estado) {
    case 'EN_REVISION':
      return `${empresa} está revisando tu postulación a «${titulo}».`;

    case 'SELECCIONADO':
      return `Tu postulación a «${titulo}» en ${empresa} fue seleccionada.`;

    case 'NO_SELECCIONADO':
      return `Tu postulación a «${titulo}» en ${empresa} no fue seleccionada. Gracias por tu interés.`;
  }
}

/**
 * La empresa solo cambia el estado, y solo a los que le corresponden. Las
 * observaciones son el mensaje del postulante: la empresa las lee pero no las
 * pisa. Cada cambio le llega al postulante como notificación.
 */
async function updateAsMember(
  id: number,
  data: Record<string, unknown>,
  actor: SessionUser,
) {
  const application = await applicationRepository.findForStatusChange(id);

  if (!application || application.oferta.socioId !== actor.socioId) {
    throw new HttpError(404, 'Postulación no encontrada');
  }

  if (data.observaciones !== undefined) {
    throw new HttpError(
      400,
      'Las observaciones las escribe el postulante y no se pueden modificar',
    );
  }

  if (data.estado === undefined) {
    throw new HttpError(400, 'Indicá el nuevo estado de la postulación');
  }

  if (
    !MEMBER_APPLICATION_STATES.includes(data.estado as MemberApplicationStatus)
  ) {
    throw new HttpError(400, 'El estado de la postulación no es válido');
  }

  const estado = data.estado as MemberApplicationStatus;

  if (application.estado === 'FINALIZADA') {
    throw new HttpError(
      409,
      'La postulación está finalizada y ya no se puede cambiar',
    );
  }

  if (application.estado !== estado) {
    const recipient = application.postulante.usuario;

    const changed = await applicationRepository.changeStatus({
      id,
      from: application.estado,
      to: estado,
      notification: recipient.activo
        ? {
            titulo: `Tu postulación: ${STATUS_LABELS[estado]}`,
            mensaje: statusMessage(
              estado,
              application.oferta.titulo,
              application.oferta.socio.razonSocial,
            ),
            creadoPorId: actor.id,
            usuarioId: recipient.id,
          }
        : null,
    });

    if (!changed) {
      throw new HttpError(
        409,
        'La postulación cambió mientras la estabas viendo. Actualizá la página.',
      );
    }
  }

  return getReceivedById(id, actor);
}

export async function update(
  id: number,
  data: UpdateApplicationData,
  actor: SessionUser,
) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new HttpError(400, 'Datos inválidos');
  }

  if (actor.tipo === 'SOCIO') {
    return updateAsMember(id, data, actor);
  }

  await findAccessible(id, actor);

  if (data.estado !== undefined && !APPLICATION_STATES.includes(data.estado)) {
    throw new HttpError(400, 'El estado de la postulación no es válido');
  }

  if (
    data.observaciones !== undefined &&
    typeof data.observaciones !== 'string'
  ) {
    throw new HttpError(400, 'El campo observaciones no es válido');
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
