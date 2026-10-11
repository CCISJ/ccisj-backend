/*
  Warnings:

  - You are about to drop the column `comprobante_url` on the `pago_cuota` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "movimiento_caja" ADD COLUMN     "comprobante_url" VARCHAR(500);

-- AlterTable
ALTER TABLE "pago_cuota" DROP COLUMN "comprobante_url";
