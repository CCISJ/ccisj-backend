export type MemberType = 'COMUN' | 'DIRECTIVO';

export type CreateMemberData = {
  razonSocial: string;
  titular: string;
  giroComercial: string;
  tipo: MemberType;

  rut: string;
  numeroBps: string;

  fechaInicioEmpresa: Date;
  fechaAfiliacion: Date;

  direccion: string;
  ciudad: string;

  celular: string;
  telefono: string;
  email: string;

  observaciones?: string;
};
