/*
  Warnings:

  - You are about to drop the column `numero_recibo` on the `pago_cuota` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "pago_cuota" DROP COLUMN "numero_recibo",
ADD COLUMN     "comprobante_url" VARCHAR(500),
ALTER COLUMN "fecha_creacion" SET DATA TYPE TIMESTAMP(3);
