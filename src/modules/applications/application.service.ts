import * as applicationRepository from './application.repository';
import * as offerRepository from '@/modules/offers/offer.repository';
import * as applicantRepository from '@/modules/applicants/applicant.repository';
import {
  CreateApplicationData,
  ApplicationStatus,
  UpdateApplicationData,
} from '@/types/application.type';

export async function getAll() {
  return applicationRepository.findAll();
}

export async function getById(id: number) {
  const application = await applicationRepository.findById(id);

  if (!application) {
    throw new Error('Postulación no encontrada');
  }

  return application;
}

export async function create(data: CreateApplicationData) {
  if (!data.ofertaId || !data.postulanteId) {
    throw new Error('Faltan datos obligatorios');
  }

  const offer = await offerRepository.findById(data.ofertaId);

  if (!offer) {
    throw new Error('Oferta no encontrada');
  }

  if (offer.estado !== 'ACTIVA') {
    throw new Error('La oferta no está activa');
  }

  const applicant = await applicantRepository.findById(data.postulanteId);

  if (!applicant) {
    throw new Error('Postulante no encontrado');
  }

  if (!applicant.cv) {
    throw new Error('El postulante debe tener un CV cargado');
  }

  const existingApplication =
    await applicationRepository.findByOfferAndApplicant(
      data.ofertaId,
      data.postulanteId,
    );

  if (existingApplication) {
    throw new Error('El postulante ya se postuló a esta oferta');
  }

  return applicationRepository.create(data);
}

export async function update(id: number, data: UpdateApplicationData) {
  const application = await applicationRepository.findById(id);

  if (!application) {
    throw new Error('Postulación no encontrada');
  }

  return applicationRepository.update(id, data);
}

export async function remove(id: number) {
  const application = await applicationRepository.findById(id);

  if (!application) {
    throw new Error('Postulación no encontrada');
  }

  return applicationRepository.remove(id);
}
