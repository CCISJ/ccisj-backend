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

type CreateCashMovementData = {
  tipo: TipoMovimientoCaja;
  categoriaId: number;
  concepto: string;
  importe: number;
  fecha: Date;
  observaciones?: string;
  registradoPorId: number;
  pagoCuotaId?: number;
};
