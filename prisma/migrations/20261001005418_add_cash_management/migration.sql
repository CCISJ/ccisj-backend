-- CreateEnum
CREATE TYPE "tipo_movimiento_caja" AS ENUM ('INGRESO', 'EGRESO');

-- CreateTable
CREATE TABLE "categoria_caja" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo" "tipo_movimiento_caja" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_caja" (
    "id" SERIAL NOT NULL,
    "tipo" "tipo_movimiento_caja" NOT NULL,
    "concepto" VARCHAR(255) NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "observaciones" VARCHAR(500),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoria_id" INTEGER NOT NULL,
    "registrado_por_id" INTEGER NOT NULL,
    "pago_cuota_id" INTEGER,

    CONSTRAINT "movimiento_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categoria_caja_nombre_tipo_key" ON "categoria_caja"("nombre", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "movimiento_caja_pago_cuota_id_key" ON "movimiento_caja"("pago_cuota_id");

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_caja"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_pago_cuota_id_fkey" FOREIGN KEY ("pago_cuota_id") REFERENCES "pago_cuota"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
