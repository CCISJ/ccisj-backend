import { TipoNotificacion } from '@/types/notification.type';
import * as notificationRepository from './notification.repository';
import * as userRepository from '../users/user.repository';
import { HttpError } from '@/utils/http-error';

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

// El título entra en la base hasta 150 caracteres; el mensaje no tiene tope en
// la base, pero un comunicado no necesita más.
const TITLE_MAX = 150;
const MESSAGE_MAX = 5000;

export async function create(data: CreateNotificationInput) {
  if (typeof data.titulo !== 'string' || !data.titulo.trim()) {
    throw new Error('El título es obligatorio');
  }

  if (typeof data.mensaje !== 'string' || !data.mensaje.trim()) {
    throw new Error('El mensaje es obligatorio');
  }

  if (data.titulo.trim().length > TITLE_MAX) {
    throw new Error(`El título no puede superar los ${TITLE_MAX} caracteres`);
  }

  if (data.mensaje.trim().length > MESSAGE_MAX) {
    throw new Error(
      `El mensaje no puede superar los ${MESSAGE_MAX} caracteres`,
    );
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

function assertReceived<T>(notification: T | null) {
  if (!notification) {
    throw new HttpError(404, 'Notificación no encontrada');
  }

  return notification;
}

export async function markAsRead(usuarioId: number, notificacionId: number) {
  return assertReceived(
    await notificationRepository.markAsRead(usuarioId, notificacionId),
  );
}

export async function markPopupAsSeen(
  usuarioId: number,
  notificacionId: number,
) {
  return assertReceived(
    await notificationRepository.markPopupAsSeen(usuarioId, notificacionId),
  );
}
