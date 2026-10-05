-- AlterTable
ALTER TABLE "movimiento_caja" ADD COLUMN     "anulado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anulado_por_id" INTEGER,
ADD COLUMN     "fecha_anulacion" TIMESTAMP(3),
ADD COLUMN     "motivo_anulacion" VARCHAR(500);

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
