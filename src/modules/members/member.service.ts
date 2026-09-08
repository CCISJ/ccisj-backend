import { CreateMemberData, UpdateMemberData } from '@/types/member.type';
import * as memberRepository from './member.repository';
import * as usuarioRepository from '../users/user.repository';

export async function getAll() {
  return memberRepository.findAll();
}

export async function getById(id: number) {
  const member = await memberRepository.findById(id);

  if (!member) {
    throw new Error('Socio no encontrado');
  }

  return member;
}

export async function create(data: CreateMemberData) {
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

  const passwordInicial = data.email;

  const socio = await memberRepository.createWithUser(data, passwordInicial);

  return {
    socio,
    passwordInicial,
  };

  return socio;
}

export async function update(id: number, data: UpdateMemberData) {
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

  return memberRepository.update(id, data);
}

export async function remove(id: number) {
  const member = await memberRepository.findById(id);

  if (!member) {
    throw new Error('Socio no encontrado');
  }

  return memberRepository.remove(id);
}
