export type CreateOfferData = {
  // Solo lo usa el administrador; para un socio sale de la sesión.
  socioId?: number;
  titulo: string;
  descripcion: string;
  ubicacion?: string;
  modalidad?: string;
  cantidadVacantes?: number;
  fechaCierre?: string;
  categoriaIds: number[];
};

export type UpdateOfferData = {
  titulo?: string;
  descripcion?: string;
  ubicacion?: string;
  modalidad?: string;
  cantidadVacantes?: number;
  fechaCierre?: string | null;
  estado?: 'ACTIVA' | 'CERRADA';
  categoriaIds?: number[];
};
