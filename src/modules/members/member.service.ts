import { CreateMemberData, MemberType } from '@/types/member.type';
import * as memberRepository from './member.repository';
import * as usuarioRepository from '../users/user.repository';
import argon2 from 'argon2';
import crypto from 'node:crypto';

const TEXT_FIELDS = [
  'razonSocial',
  'titular',
  'giroComercial',
  'rut',
  'numeroBps',
  'direccion',
  'ciudad',
  'celular',
  'telefono',
  'email',
] as const;

const DATE_FIELDS = ['fechaInicioEmpresa', 'fechaAfiliacion'] as const;

const MEMBER_TYPES: MemberType[] = ['COMUN', 'DIRECTIVO'];

/**
 * Arma los datos del socio solo con los campos permitidos y del tipo
 * correcto. Cualquier otra cosa del body (`usuarioId`, `id`, ...) se descarta:
 * pasarle el body tal cual a Prisma permitía reasignar el socio a otro usuario.
 */
function parseMemberData(body: unknown): Partial<CreateMemberData> {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Datos inválidos');
  }

  const input = body as Record<string, unknown>;
  const data: Partial<CreateMemberData> = {};

  for (const field of TEXT_FIELDS) {
    const value = input[field];

    if (value === undefined) continue;

    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`El campo ${field} no es válido`);
    }

    data[field] = value.trim();
  }

  for (const field of DATE_FIELDS) {
    const value = input[field];

    if (value === undefined) continue;

    const date =
      typeof value === 'string' || value instanceof Date
        ? new Date(value)
        : null;

    if (!date || Number.isNaN(date.getTime())) {
      throw new Error(`El campo ${field} no es una fecha válida`);
    }

    data[field] = date;
  }

  if (input.tipo !== undefined) {
    if (!MEMBER_TYPES.includes(input.tipo as MemberType)) {
      throw new Error('El tipo de socio no es válido');
    }

    data.tipo = input.tipo as MemberType;
  }

  const observaciones = input.observaciones;

  if (observaciones !== undefined) {
    if (observaciones !== null && typeof observaciones !== 'string') {
      throw new Error('El campo observaciones no es válido');
    }

    // Vacío o null borra las observaciones.
    data.observaciones = observaciones?.trim() || null;
  }

  return data;
}

export async function getAll() {
  return memberRepository.findAll();
}

export async function getDirectory() {
  return memberRepository.findDirectory();
}

export async function getById(id: number) {
  const member = await memberRepository.findById(id);

  if (!member) {
    throw new Error('Socio no encontrado');
  }

  return member;
}

export async function getDirectoryEntry(id: number) {
  const member = await memberRepository.findDirectoryEntry(id);

  if (!member) {
    throw new Error('Socio no encontrado');
  }

  return member;
}

export async function create(body: unknown) {
  const data = parseMemberData(body);

  if (
    !data.razonSocial ||
    !data.titular ||
    !data.giroComercial ||
    !data.tipo ||
    !data.rut ||
    !data.numeroBps ||
    !data.fechaInicioEmpresa ||
    !data.fechaAfiliacion ||
    !data.direccion ||
    !data.ciudad ||
    !data.celular ||
    !data.telefono ||
    !data.email
  ) {
    throw new Error('Faltan datos obligatorios');
  }

  const existingMember = await memberRepository.findByRut(data.rut);

  if (existingMember) {
    throw new Error('El RUT ya está registrado');
  }

  const existingUser = await usuarioRepository.findByEmail(data.email);

  if (existingUser) {
    throw new Error('El email ya está registrado');
  }

  const existingMemberByBps = await memberRepository.findByNumeroBps(
    data.numeroBps,
  );

  if (existingMemberByBps) {
    throw new Error('El número de BPS ya está registrado');
  }

  const passwordInicial = crypto.randomBytes(6).toString('base64url');

  const passwordHash = await argon2.hash(passwordInicial);

  const socio = await memberRepository.createWithUser(
    data as CreateMemberData,
    passwordHash,
  );

  return {
    socioId: socio.id,
    email: socio.usuario.email,
    passwordInicial,
  };
}

export async function update(id: number, body: unknown) {
  const data = parseMemberData(body);

  const member = await memberRepository.findById(id);

  if (!member) {
    throw new Error('Socio no encontrado');
  }

  if (data.rut && data.rut !== member.rut) {
    const existingMember = await memberRepository.findByRut(data.rut);

    if (existingMember) {
      throw new Error('El RUT ya está registrado');
    }
  }

  if (data.numeroBps && data.numeroBps !== member.numeroBps) {
    const existingMember = await memberRepository.findByNumeroBps(
      data.numeroBps,
    );

    if (existingMember) {
      throw new Error('El número de BPS ya está registrado');
    }
  }

  if (data.email && data.email !== member.email) {
    const existingUser = await usuarioRepository.findByEmail(data.email);

    if (existingUser && existingUser.id !== member.usuarioId) {
      throw new Error('El email ya está registrado');
    }
  }

  return memberRepository.update(id, member.usuarioId, data);
}

export async function remove(id: number) {
  const member = await memberRepository.findById(id);

  if (!member) {
    throw new Error('Socio no encontrado');
  }

  return memberRepository.remove(id, member.usuarioId);
}
