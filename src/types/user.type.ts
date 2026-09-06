export type TipoUsuario = 'BACKOFFICE' | 'POSTULANTE' | 'SOCIO';

export type MemberType = 'COMUN' | 'DIRECTIVO';

// MEMBERS
export type CreateMemberData = {
  usuarioId: number;
  nombre: string;
  rut: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  tipo?: MemberType;
};

export type UpdateMemberData = {
  nombre?: string;
  rut?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  tipo?: MemberType;
  activo?: boolean;
};

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
