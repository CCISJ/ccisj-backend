-- CreateEnum
CREATE TYPE "tipo_ajuste_cuota" AS ENUM ('ADICIONAL', 'DESCUENTO');

-- CreateEnum
CREATE TYPE "estado_cuota" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA');

-- CreateTable
CREATE TABLE "configuracion_cuota" (
    "id" SERIAL NOT NULL,
    "importe_base" DECIMAL(10,2) NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "fecha_creacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configuracion_cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajuste_cuota_socio" (
    "id" SERIAL NOT NULL,
    "socio_id" INTEGER NOT NULL,
    "tipo" "tipo_ajuste_cuota" NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "fecha_desde" DATE NOT NULL,
    "fecha_hasta" DATE,
    "motivo" VARCHAR(255),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajuste_cuota_socio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuota" (
    "id" SERIAL NOT NULL,
    "socio_id" INTEGER NOT NULL,
    "periodo_desde" DATE NOT NULL,
    "periodo_hasta" DATE NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "importe_base" DECIMAL(10,2) NOT NULL,
    "importe_ajustes" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "importe_total" DECIMAL(10,2) NOT NULL,
    "estado" "estado_cuota" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_creacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_cuota" (
    "id" SERIAL NOT NULL,
    "socio_id" INTEGER NOT NULL,
    "registrado_por_id" INTEGER NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "fecha_pago" TIMESTAMP(6) NOT NULL,
    "medio_pago" VARCHAR(50) NOT NULL,
    "numero_recibo" VARCHAR(100),
    "observaciones" VARCHAR(500),
    "fecha_creacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_cuota_detalle" (
    "id" SERIAL NOT NULL,
    "pago_id" INTEGER NOT NULL,
    "cuota_id" INTEGER NOT NULL,
    "importe_aplicado" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "pago_cuota_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pago_cuota_detalle_pago_id_cuota_id_key" ON "pago_cuota_detalle"("pago_id", "cuota_id");

-- AddForeignKey
ALTER TABLE "ajuste_cuota_socio" ADD CONSTRAINT "ajuste_cuota_socio_socio_id_fkey" FOREIGN KEY ("socio_id") REFERENCES "Socio"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuota" ADD CONSTRAINT "cuota_socio_id_fkey" FOREIGN KEY ("socio_id") REFERENCES "Socio"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cuota" ADD CONSTRAINT "pago_cuota_socio_id_fkey" FOREIGN KEY ("socio_id") REFERENCES "Socio"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cuota" ADD CONSTRAINT "pago_cuota_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cuota_detalle" ADD CONSTRAINT "pago_cuota_detalle_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pago_cuota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cuota_detalle" ADD CONSTRAINT "pago_cuota_detalle_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "cuota"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
