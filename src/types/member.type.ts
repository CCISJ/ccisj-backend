export type MemberType = 'COMUN' | 'DIRECTIVO';

// Los únicos datos que el socio puede cambiar de su propia empresa.
export type OwnEditableField =
  'telefono' | 'celular' | 'email' | 'direccion' | 'ciudad' | 'numeroBps';

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

  observaciones?: string | null;
};
