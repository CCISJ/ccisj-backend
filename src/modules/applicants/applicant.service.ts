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

  // Tipos antes de consultar la base: un objeto en lugar de un texto o un
  // número llegaría a Prisma como filtro o como escritura anidada.
  if (
    !Number.isInteger(data.usuarioId) ||
    typeof data.nombre !== 'string' ||
    typeof data.apellido !== 'string' ||
    (data.telefono !== undefined && typeof data.telefono !== 'string')
  ) {
    throw new Error('Datos inválidos');
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

  return applicantRepository.create({
    usuarioId: data.usuarioId,
    nombre: data.nombre.trim(),
    apellido: data.apellido.trim(),
    telefono: data.telefono?.trim(),
  });
}

export async function update(id: number, data: Record<string, unknown>) {
  const applicant = await applicantRepository.findById(id);

  if (!applicant) {
    throw new Error('Postulante no encontrado');
  }

  // Solo los campos del perfil: el body completo iba directo a Prisma y
  // permitía, por ejemplo, cambiar el `usuarioId`.
  const changes: UpdateApplicantData = {};

  for (const field of ['nombre', 'apellido', 'telefono'] as const) {
    const value = data?.[field];

    if (value === undefined) continue;

    if (typeof value !== 'string') {
      throw new Error(`El campo ${field} no es válido`);
    }

    changes[field] = value.trim();
  }

  if (changes.nombre === '' || changes.apellido === '') {
    throw new Error('Nombre y apellido no pueden quedar vacíos');
  }

  return applicantRepository.update(id, changes);
}

export async function remove(id: number) {
  const applicant = await applicantRepository.findById(id);

  if (!applicant) {
    throw new Error('Postulante no encontrado');
  }

  return applicantRepository.remove(id);
}
