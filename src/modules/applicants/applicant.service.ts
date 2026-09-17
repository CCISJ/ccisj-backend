import * as usuarioRepository from '@/modules/users/user.repository';
import { UpdateApplicantData } from '@/types/user.type';
import { HttpError } from '@/utils/http-error';

import * as applicantRepository from './applicant.repository';

// Los mismos largos que la base (`VarChar(100)` y `VarChar(50)`): pasarse
// terminaba en un error de Prisma en vez de un mensaje claro.
const FIELD_RULES = {
  nombre: { label: 'El nombre', max: 100 },
  apellido: { label: 'El apellido', max: 100 },
  telefono: { label: 'El teléfono', max: 50 },
} as const;

type ProfileField = keyof typeof FIELD_RULES;

function assertObject(body: unknown): asserts body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Datos inválidos');
  }
}

function parseField(field: ProfileField, value: unknown) {
  if (typeof value !== 'string') {
    throw new Error(`El campo ${field} no es válido`);
  }

  const trimmed = value.trim();
  const { label, max } = FIELD_RULES[field];

  if (trimmed.length > max) {
    throw new Error(`${label} no puede superar los ${max} caracteres`);
  }

  return trimmed;
}

async function findExisting(id: number) {
  const applicant = await applicantRepository.findById(id);

  if (!applicant) {
    throw new HttpError(404, 'Postulante no encontrado');
  }

  return applicant;
}

export async function getAll() {
  return applicantRepository.findAll();
}

export async function getById(id: number) {
  return findExisting(id);
}

export async function create(body: unknown) {
  assertObject(body);

  const { usuarioId } = body;

  if (!usuarioId || !body.nombre || !body.apellido) {
    throw new Error('Faltan datos obligatorios');
  }

  // Tipos antes de consultar la base: un objeto en lugar de un texto o un
  // número llegaría a Prisma como filtro o como escritura anidada.
  if (!Number.isInteger(usuarioId) || (usuarioId as number) <= 0) {
    throw new Error('Datos inválidos');
  }

  const nombre = parseField('nombre', body.nombre);
  const apellido = parseField('apellido', body.apellido);
  const telefono =
    body.telefono === undefined
      ? undefined
      : parseField('telefono', body.telefono);

  if (!nombre || !apellido) {
    throw new Error('Faltan datos obligatorios');
  }

  const usuario = await usuarioRepository.findByIdWithApplicant(
    usuarioId as number,
  );

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
    usuarioId: usuarioId as number,
    nombre,
    apellido,
    telefono,
  });
}

export async function update(id: number, body: unknown) {
  assertObject(body);

  await findExisting(id);

  // Solo los campos del perfil: el body completo iba directo a Prisma y
  // permitía, por ejemplo, cambiar el `usuarioId`.
  const changes: UpdateApplicantData = {};

  for (const field of ['nombre', 'apellido', 'telefono'] as const) {
    if (body[field] === undefined) continue;

    changes[field] = parseField(field, body[field]);
  }

  if (changes.nombre === '' || changes.apellido === '') {
    throw new Error('Nombre y apellido no pueden quedar vacíos');
  }

  return applicantRepository.update(id, changes);
}

export async function remove(id: number) {
  await findExisting(id);

  return applicantRepository.remove(id);
}
