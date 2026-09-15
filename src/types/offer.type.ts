export const OFFER_STATES = ['ACTIVA', 'CERRADA'] as const;

export type OfferStatus = (typeof OFFER_STATES)[number];

export const OFFER_MODALITIES = ['PRESENCIAL', 'REMOTO', 'HIBRIDO'] as const;

export type OfferModality = (typeof OFFER_MODALITIES)[number];

export type CreateOfferData = {
  // Solo lo usa el administrador; para un socio sale de la sesión.
  socioId?: number;
  titulo: string;
  descripcion: string;
  ubicacion?: string | null;
  modalidad?: OfferModality | null;
  cantidadVacantes?: number;
  // Día de cierre, "AAAA-MM-DD". La oferta recibe postulaciones hasta el final
  // de ese día (hora de Uruguay).
  fechaCierre?: string | null;
  categoriaIds: number[];
};

export type UpdateOfferData = {
  titulo?: string;
  descripcion?: string;
  ubicacion?: string | null;
  modalidad?: OfferModality | null;
  cantidadVacantes?: number;
  fechaCierre?: string | null;
  estado?: OfferStatus;
  categoriaIds?: number[];
};
