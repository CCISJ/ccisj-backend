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
  /** El archivo tal como lo deja multer; se guarda en Supabase Storage. */
  comprobante?: Express.Multer.File;
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
  /**
   * Ruta del comprobante ya subido a Storage. Va en el movimiento de caja del
   * pago, como en cualquier otro movimiento: `pago_cuota` no tiene columna
   * para esto desde la migración 20261008221118.
   */
  comprobanteUrl?: string;
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
