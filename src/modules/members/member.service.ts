import { CreateMemberData, UpdateMemberData } from '@/types/user.type';
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
  if (!data.usuarioId || !data.nombre || !data.rut) {
    throw new Error('Faltan datos obligatorios');
  }

  const usuario = await usuarioRepository.findByIdWithMember(data.usuarioId);

  if (!usuario) {
    throw new Error('Usuario no encontrado');
  }

  if (usuario.tipo !== 'SOCIO') {
    throw new Error('El usuario debe ser de tipo SOCIO');
  }

  if (usuario.socio) {
    throw new Error('El usuario ya tiene un socio asociado');
  }

  const existingMember = await memberRepository.findByRut(data.rut);

  if (existingMember) {
    throw new Error('El RUT ya está registrado');
  }

  return memberRepository.create(data);
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
