import type { TipoMovimientoCaja } from '@/generated/prisma/enums';

export type CreateManualCashMovementData = {
  tipo: TipoMovimientoCaja;
  categoriaId: number;
  concepto: string;
  importe: number;
  fecha: Date;
  observaciones?: string;
  registradoPorId: number;
};

export type CashMovementFilters = {
  desde?: Date;
  hasta?: Date;
  tipo?: 'INGRESO' | 'EGRESO';
  categoriaId?: number;
  buscar?: string;
};
