import { TipoNotificacion } from '@/types/notification.type';
import * as notificationRepository from './notification.repository';
import * as userRepository from '../users/user.repository';

type DestinatarioTipo = 'TODOS' | 'SOCIOS' | 'POSTULANTES' | 'USUARIOS';

type CreateNotificationInput = {
  titulo: string;
  mensaje: string;
  tipo: TipoNotificacion;
  creadoPorId: number;
  destinatarioTipo: DestinatarioTipo;
  usuarioIds?: number[];
};

const NOTIFICATION_TYPES: TipoNotificacion[] = ['NORMAL', 'EMERGENTE'];

export async function create(data: CreateNotificationInput) {
  if (typeof data.titulo !== 'string' || !data.titulo.trim()) {
    throw new Error('El título es obligatorio');
  }

  if (typeof data.mensaje !== 'string' || !data.mensaje.trim()) {
    throw new Error('El mensaje es obligatorio');
  }

  if (data.tipo !== undefined && !NOTIFICATION_TYPES.includes(data.tipo)) {
    throw new Error('El tipo de notificación no es válido');
  }

  let usuarios: { id: number }[] = [];

  switch (data.destinatarioTipo) {
    case 'TODOS':
      usuarios = await userRepository.findActiveUsers();
      break;

    case 'SOCIOS':
      usuarios = await userRepository.findActiveUsersByType('SOCIO');
      break;

    case 'POSTULANTES':
      usuarios = await userRepository.findActiveUsersByType('POSTULANTE');
      break;

    case 'USUARIOS':
      if (!Array.isArray(data.usuarioIds) || data.usuarioIds.length === 0) {
        throw new Error('Debe seleccionar al menos un usuario');
      }

      if (!data.usuarioIds.every((id) => Number.isInteger(id) && id > 0)) {
        throw new Error('Los usuarios seleccionados no son válidos');
      }

      usuarios = await userRepository.findUsersByIds(data.usuarioIds);
      break;

    default:
      throw new Error('Tipo de destinatario inválido');
  }

  if (usuarios.length === 0) {
    throw new Error('No se encontraron destinatarios');
  }

  return notificationRepository.create({
    titulo: data.titulo.trim(),
    mensaje: data.mensaje.trim(),
    tipo: data.tipo,
    creadoPorId: data.creadoPorId,
    usuarioIds: usuarios.map((usuario) => usuario.id),
  });
}

export async function getAll() {
  return notificationRepository.findAll();
}

export async function getByUserId(usuarioId: number) {
  return notificationRepository.findByUserId(usuarioId);
}

export async function getPendingPopups(usuarioId: number) {
  return notificationRepository.findPendingPopups(usuarioId);
}

export async function markAsRead(usuarioId: number, notificacionId: number) {
  return notificationRepository.markAsRead(usuarioId, notificacionId);
}

export async function markPopupAsSeen(
  usuarioId: number,
  notificacionId: number,
) {
  return notificationRepository.markPopupAsSeen(usuarioId, notificacionId);
}
