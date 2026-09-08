export type TipoUsuario = 'ADMIN' | 'POSTULANTE' | 'SOCIO';

// APPLICANTS
export type CreateApplicantData = {
  usuarioId: number;
  nombre: string;
  apellido: string;
  telefono?: string;
};

export type UpdateApplicantData = {
  nombre?: string;
  apellido?: string;
  telefono?: string;
};
