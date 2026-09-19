/*
  Warnings:

  - A unique constraint covering the columns `[vigencia_desde]` on the table `configuracion_cuota` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "configuracion_cuota_vigencia_desde_key" ON "configuracion_cuota"("vigencia_desde");
