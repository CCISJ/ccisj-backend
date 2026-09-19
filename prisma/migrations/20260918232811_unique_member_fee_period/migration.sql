/*
  Warnings:

  - A unique constraint covering the columns `[socio_id,periodo_desde]` on the table `cuota` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "cuota_socio_id_periodo_desde_key" ON "cuota"("socio_id", "periodo_desde");
