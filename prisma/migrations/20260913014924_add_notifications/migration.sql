-- CreateEnum
CREATE TYPE "tipo_notificacion" AS ENUM ('NORMAL', 'EMERGENTE');

-- DropIndex
DROP INDEX "cv_postulante_id_key";

-- CreateTable
CREATE TABLE "notificacion" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "tipo" "tipo_notificacion" NOT NULL DEFAULT 'NORMAL',
    "fecha_creacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por_id" INTEGER NOT NULL,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion_usuario" (
    "id" SERIAL NOT NULL,
    "notificacion_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "fecha_lectura" TIMESTAMP(6),
    "emergente_vista" BOOLEAN NOT NULL DEFAULT false,
    "fecha_emergente_vista" TIMESTAMP(6),

    CONSTRAINT "notificacion_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_usuario_notificacion_id_usuario_id_key" ON "notificacion_usuario"("notificacion_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notificacion_usuario" ADD CONSTRAINT "notificacion_usuario_notificacion_id_fkey" FOREIGN KEY ("notificacion_id") REFERENCES "notificacion"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notificacion_usuario" ADD CONSTRAINT "notificacion_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
