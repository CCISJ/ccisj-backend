import argon2 from 'argon2';

import { Prisma } from '@/generated/prisma/client';
import {
  CreateMemberData,
  MemberType,
  OwnEditableField,
} from '@/types/member.type';
import { EMAIL_PATTERN, normalizeEmail } from '@/utils/email';
import { HttpError } from '@/utils/http-error';
import { generatePassword } from '@/utils/password';

import * as usuarioRepository from '../users/user.repository';
import * as memberRepository from './member.repository';

const PHONE_PATTERN = /^\+?[\d\s()-]{6,20}$/;
const PHONE_INVALID = 'solo puede tener números, espacios, +, - y paréntesis';

// El número de empresa del BPS tiene entre 7 y 12 dígitos. Vale igual para el
// alta que hace la administración y para lo que edita el propio socio.
const BPS_PATTERN = /^\d{7,12}$/;
const BPS_INVALID = 'El número de BPS debe tener entre 7 y 12 números';

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

// Largo máximo y nombre para los mensajes. La base no limita estos campos:
// sin tope se podía guardar cualquier cosa. Son los mismos largos que usa la
// empresa al editar sus datos.
const TEXT_RULES: Record<
  (typeof TEXT_FIELDS)[number],
  { label: string; max: number }
> = {
  razonSocial: { label: 'La razón social', max: 150 },
  titular: { label: 'El titular', max: 150 },
  giroComercial: { label: 'El giro comercial', max: 100 },
  rut: { label: 'El RUT', max: 50 },
  numeroBps: { label: 'El número de BPS', max: 12 },
  direccion: { label: 'La dirección', max: 150 },
  ciudad: { label: 'La ciudad', max: 80 },
  celular: { label: 'El celular', max: 20 },
  telefono: { label: 'El teléfono', max: 20 },
  email: { label: 'El email', max: 255 },
};

const OBSERVATIONS_MAX = 2000;

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

    const { label, max } = TEXT_RULES[field];

    if (field !== 'numeroBps' && data[field].length > max) {
      throw new Error(`${label} no puede superar los ${max} caracteres`);
    }
  }

  if (data.numeroBps !== undefined && !BPS_PATTERN.test(data.numeroBps)) {
    throw new Error(BPS_INVALID);
  }

  for (const field of ['telefono', 'celular'] as const) {
    if (data[field] !== undefined && !PHONE_PATTERN.test(data[field])) {
      throw new Error(`${TEXT_RULES[field].label} ${PHONE_INVALID}`);
    }
  }

  // Es también el email de acceso de la cuenta: en minúsculas, como todos.
  if (data.email !== undefined) {
    data.email = normalizeEmail(data.email);

    if (!EMAIL_PATTERN.test(data.email)) {
      throw new Error('El email no es válido');
    }
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

    if (data.observaciones && data.observaciones.length > OBSERVATIONS_MAX) {
      throw new Error(
        `Las observaciones no pueden superar los ${OBSERVATIONS_MAX} caracteres`,
      );
    }
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
    throw new HttpError(404, 'Socio no encontrado');
  }

  return member;
}

export async function getDirectoryEntry(id: number) {
  const member = await memberRepository.findDirectoryEntry(id);

  if (!member) {
    throw new HttpError(404, 'Socio no encontrado');
  }

  return member;
}

/**
 * Reglas de cada dato que el socio edita de su empresa. Los largos máximos
 * evitan que se guarde cualquier cosa en campos que la base no limita.
 */
type FieldRule = {
  maxLength: number;
  pattern?: RegExp;
  required: string;
  tooLong: string;
  invalid?: string;
};

const OWN_FIELD_RULES: Record<OwnEditableField, FieldRule> = {
  telefono: {
    maxLength: 20,
    pattern: PHONE_PATTERN,
    required: 'El teléfono es obligatorio',
    tooLong: 'El teléfono no puede superar los 20 caracteres',
    invalid: `El teléfono ${PHONE_INVALID}`,
  },
  celular: {
    maxLength: 20,
    pattern: PHONE_PATTERN,
    required: 'El celular es obligatorio',
    tooLong: 'El celular no puede superar los 20 caracteres',
    invalid: `El celular ${PHONE_INVALID}`,
  },
  email: {
    maxLength: 255,
    pattern: EMAIL_PATTERN,
    required: 'El email de contacto es obligatorio',
    tooLong: 'El email de contacto no puede superar los 255 caracteres',
    invalid: 'El email de contacto no es válido',
  },
  direccion: {
    maxLength: 150,
    required: 'La dirección es obligatoria',
    tooLong: 'La dirección no puede superar los 150 caracteres',
  },
  ciudad: {
    maxLength: 80,
    required: 'La ciudad es obligatoria',
    tooLong: 'La ciudad no puede superar los 80 caracteres',
  },
  numeroBps: {
    maxLength: 12,
    pattern: BPS_PATTERN,
    required: 'El número de BPS es obligatorio',
    tooLong: BPS_INVALID,
    invalid: BPS_INVALID,
  },
};

export async function getOwnProfile(socioId: number | null) {
  const member = socioId
    ? await memberRepository.findOwnProfile(socioId)
    : null;

  if (!member) {
    throw new HttpError(404, 'Socio no encontrado');
  }

  return member;
}

/**
 * El socio actualiza sus datos de contacto y su número de BPS. Un campo
 * fuera de esa lista se rechaza en vez de ignorarse: si la pantalla intenta
 * mandar algo más, es un error que conviene ver.
 */
export async function updateOwnProfile(socioId: number | null, body: unknown) {
  const member = socioId
    ? await memberRepository.findOwnProfile(socioId)
    : null;

  if (!member) {
    throw new HttpError(404, 'Socio no encontrado');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Datos inválidos');
  }

  const input = body as Record<string, unknown>;
  const changes: Partial<Record<OwnEditableField, string>> = {};

  for (const key of Object.keys(input)) {
    // `in` también acepta `toString` o `constructor`, heredados del prototipo.
    if (!Object.hasOwn(OWN_FIELD_RULES, key)) {
      throw new HttpError(400, `No se puede modificar el campo ${key}`);
    }

    const field = key as OwnEditableField;
    const rule = OWN_FIELD_RULES[field];
    const value = input[field];

    if (typeof value !== 'string' || !value.trim()) {
      throw new HttpError(400, rule.required);
    }

    const trimmed = value.trim();

    if (trimmed.length > rule.maxLength) {
      throw new HttpError(400, rule.tooLong);
    }

    if (rule.pattern && !rule.pattern.test(trimmed)) {
      throw new HttpError(400, rule.invalid ?? 'Datos inválidos');
    }

    if (trimmed !== member[field]) {
      changes[field] = trimmed;
    }
  }

  if (Object.keys(changes).length === 0) {
    return member;
  }

  if (changes.numeroBps) {
    const existing = await memberRepository.findByNumeroBps(changes.numeroBps);

    if (existing && existing.id !== member.id) {
      throw new HttpError(400, 'El número de BPS ya está registrado');
    }
  }

  try {
    return await memberRepository.updateOwnProfile(member.id, changes);
  } catch (error) {
    // Dos socios guardando el mismo BPS a la vez: la verificación de arriba
    // no alcanza y lo frena la restricción única de la base.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new HttpError(400, 'El número de BPS ya está registrado');
    }

    throw error;
  }
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

  // La administración la entrega a mano: 12 caracteres sin letras que se
  // confundan, que cumplen las mismas reglas que una contraseña elegida.
  const passwordInicial = generatePassword();

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
    throw new HttpError(404, 'Socio no encontrado');
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
    throw new HttpError(404, 'Socio no encontrado');
  }

  // El aviso no cuenta que la empresa se dio de baja: solo que la oferta cerró.
  return memberRepository.remove(id, member.usuarioId, (offerTitle) => ({
    titulo: 'Tu postulación: Finalizada',
    mensaje: `La oferta «${offerTitle}» de ${member.razonSocial} se cerró y tu postulación quedó finalizada. Gracias por tu interés.`,
  }));
}
