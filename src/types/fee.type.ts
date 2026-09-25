export type TipoAjusteCuota = 'ADICIONAL' | 'DESCUENTO';

export type CreateFeeData = {
  socioId: number;
  periodoDesde: Date;
  periodoHasta: Date;
  fechaVencimiento: Date;
  importeBase: number;
  importeAjustes: number;
  importeTotal: number;
};

export type CreateFeeAdjustmentData = {
  socioId: number;
  tipo: TipoAjusteCuota;
  importe: number;
  fechaDesde: Date;
  fechaHasta?: Date;
  motivo?: string;
};

export type RegisterFeePaymentData = {
  socioId: number;
  registradoPorId: number;
  importe: number;
  fechaPago: Date;
  medioPago: string;
  numeroRecibo?: string;
  observaciones?: string;
};

export type PaymentDetailData = {
  cuotaId: number;
  importeAplicado: number;
  estadoResultante: 'PARCIAL' | 'PAGADA';
};

export type CreateFeePaymentData = {
  socioId: number;
  registradoPorId: number;
  importe: number;
  fechaPago: Date;
  medioPago: string;
  numeroRecibo?: string;
  observaciones?: string;
  detalles: PaymentDetailData[];
};

export type AddFeeAdjustmentData = {
  socioId: number;
  tipo: TipoAjusteCuota;
  importe: number;
  fechaDesde: Date;
  fechaHasta?: Date;
  motivo?: string;
};
