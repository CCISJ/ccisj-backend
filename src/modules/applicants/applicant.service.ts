import * as applicantRepository from './applicant.repository';
import * as usuarioRepository from '@/modules/users/user.repository';
import { CreateApplicantData, UpdateApplicantData } from '@/types/user.type';

export async function getAll() {
  return applicantRepository.findAll();
}

export async function getById(id: number) {
  const applicant = await applicantRepository.findById(id);

  if (!applicant) {
    throw new Error('Postulante no encontrado');
  }

  return applicant;
}

export async function create(data: CreateApplicantData) {
  if (!data.usuarioId || !data.nombre || !data.apellido) {
    throw new Error('Faltan datos obligatorios');
  }

  const usuario = await usuarioRepository.findByIdWithApplicant(data.usuarioId);

  if (!usuario) {
    throw new Error('Usuario no encontrado');
  }

  if (usuario.tipo !== 'POSTULANTE') {
    throw new Error('El usuario debe ser de tipo POSTULANTE');
  }

  if (usuario.postulante) {
    throw new Error('El usuario ya tiene un postulante asociado');
  }

  return applicantRepository.create(data);
}

export async function update(id: number, data: UpdateApplicantData) {
  const applicant = await applicantRepository.findById(id);

  if (!applicant) {
    throw new Error('Postulante no encontrado');
  }

  return applicantRepository.update(id, data);
}

export async function remove(id: number) {
  const applicant = await applicantRepository.findById(id);

  if (!applicant) {
    throw new Error('Postulante no encontrado');
  }

  return applicantRepository.remove(id);
}
