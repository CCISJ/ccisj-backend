import { CreateMemberData } from '@/types/member.type';
import * as memberRepository from './member.repository';
import * as usuarioRepository from '../users/user.repository';
import argon2 from 'argon2';
import crypto from 'node:crypto';

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

  const existingMemberByBps = await memberRepository.findByNumeroBps(
    data.numeroBps,
  );

  if (existingMemberByBps) {
    throw new Error('El número de BPS ya está registrado');
  }

  const passwordInicial = crypto.randomBytes(6).toString('base64url');

  const passwordHash = await argon2.hash(passwordInicial);

  const socio = await memberRepository.createWithUser(data, passwordHash);

  return {
    socioId: socio.id,
    email: socio.usuario.email,
    passwordInicial,
  };
}

export async function update(id: number, data: Partial<CreateMemberData>) {
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

  if (data.email && data.email !== member.email) {
    const existingUser = await usuarioRepository.findByEmail(data.email);

    if (existingUser) {
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
