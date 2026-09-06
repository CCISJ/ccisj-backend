export type CreateOfferData = {
  socioId: number;
  creadaPor: number;
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
