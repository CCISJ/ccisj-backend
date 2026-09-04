export type TipoUsuario = 'BACKOFFICE' | 'POSTULANTE' | 'SOCIO';

export type MemberType = 'COMUN' | 'DIRECTIVO';

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
