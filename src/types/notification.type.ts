export type TipoNotificacion = 'NORMAL' | 'EMERGENTE';

export type DestinatarioTipo = 'TODOS' | 'SOCIOS' | 'POSTULANTES' | 'USUARIOS' | 'SOCIOS_DIRECTIVOS' | 'SOCIOS_COMUNES';

export type CreateNotificationData = {
  titulo: string;
  mensaje: string;
  tipo: TipoNotificacion;
  creadoPorId: number;
  usuarioIds: number[];
};

export type CreateNotificationInput = {
  titulo: string;
  mensaje: string;
  tipo: TipoNotificacion;
  creadoPorId: number;
  destinatarioTipo: DestinatarioTipo;
  usuarioIds?: number[];
};
