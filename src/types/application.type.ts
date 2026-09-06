export type ApplicationStatus =
  | 'ENVIADA'
  | 'EN_REVISION'
  | 'SELECCIONADO'
  | 'NO_SELECCIONADO'
  | 'FINALIZADA';

export type CreateApplicationData = {
  ofertaId: number;
  postulanteId: number;
  observaciones?: string;
};

export type UpdateApplicationData = {
  estado?: ApplicationStatus;
  observaciones?: string;
};
