-- CreateEnum
CREATE TYPE "EstadoEnvioEmail" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "envio_email" (
    "id" SERIAL NOT NULL,
    "notificacion_id" INTEGER,
    "usuario_id" INTEGER,
    "email" VARCHAR(255) NOT NULL,
    "estado" "EstadoEnvioEmail" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoError" TEXT,
    "resendId" TEXT,
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEnvio" TIMESTAMP(3),

    CONSTRAINT "envio_email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "envio_email_notificacion_id_usuario_id_key" ON "envio_email"("notificacion_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "envio_email" ADD CONSTRAINT "envio_email_notificacion_id_fkey" FOREIGN KEY ("notificacion_id") REFERENCES "notificacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio_email" ADD CONSTRAINT "envio_email_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
