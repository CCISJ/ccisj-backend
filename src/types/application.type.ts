export type ApplicationStatus =
  'ENVIADA' | 'EN_REVISION' | 'SELECCIONADO' | 'NO_SELECCIONADO' | 'FINALIZADA';

/**
 * Estados a los que la empresa puede pasar una postulación a sus ofertas.
 * ENVIADA la pone el sistema al postularse y FINALIZADA no la marca la empresa.
 */
export const MEMBER_APPLICATION_STATES = [
  'EN_REVISION',
  'SELECCIONADO',
  'NO_SELECCIONADO',
] as const satisfies readonly ApplicationStatus[];

export type MemberApplicationStatus =
  (typeof MEMBER_APPLICATION_STATES)[number];

export type CreateApplicationData = {
  ofertaId: number;
  observaciones?: string;
};

export type UpdateApplicationData = {
  estado?: ApplicationStatus;
  observaciones?: string;
};
