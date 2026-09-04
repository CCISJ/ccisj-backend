-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "estado_oferta" AS ENUM ('ACTIVA', 'CERRADA');

-- CreateEnum
CREATE TYPE "estado_postulacion" AS ENUM ('ENVIADA', 'EN_REVISION', 'SELECCIONADO', 'NO_SELECCIONADO', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "tipo_socio" AS ENUM ('COMUN', 'DIRECTIVO');

-- CreateEnum
CREATE TYPE "tipo_usuario" AS ENUM ('BACKOFFICE', 'POSTULANTE', 'SOCIO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "tipo" "tipo_usuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_creacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socio" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "rut" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "telefono" VARCHAR(50),
    "direccion" VARCHAR(255),
    "tipo" "tipo_socio" NOT NULL DEFAULT 'COMUN',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "socio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postulante" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellido" VARCHAR(100) NOT NULL,
    "telefono" VARCHAR(50),

    CONSTRAINT "postulante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv" (
    "id" SERIAL NOT NULL,
    "postulante_id" INTEGER NOT NULL,
    "archivo_url" VARCHAR(500),
    "descripcion" TEXT,
    "fecha_actualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta" (
    "id" SERIAL NOT NULL,
    "socio_id" INTEGER NOT NULL,
    "creada_por" INTEGER NOT NULL,
    "titulo" VARCHAR(255) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "ubicacion" VARCHAR(255),
    "modalidad" VARCHAR(100),
    "cantidad_vacantes" INTEGER NOT NULL DEFAULT 1,
    "fecha_publicacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMP(6),
    "estado" "estado_oferta" NOT NULL DEFAULT 'ACTIVA',

    CONSTRAINT "oferta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oferta_categoria" (
    "oferta_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,

    CONSTRAINT "oferta_categoria_pkey" PRIMARY KEY ("oferta_id","categoria_id")
);

-- CreateTable
CREATE TABLE "postulacion" (
    "id" SERIAL NOT NULL,
    "oferta_id" INTEGER NOT NULL,
    "postulante_id" INTEGER NOT NULL,
    "fecha_postulacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "estado_postulacion" NOT NULL DEFAULT 'ENVIADA',
    "observaciones" TEXT,

    CONSTRAINT "postulacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "socio_usuario_id_key" ON "socio"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "socio_rut_key" ON "socio"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "postulante_usuario_id_key" ON "postulante"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "cv_postulante_id_key" ON "cv"("postulante_id");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nombre_key" ON "categoria"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "uq_postulacion" ON "postulacion"("oferta_id", "postulante_id");

-- AddForeignKey
ALTER TABLE "socio" ADD CONSTRAINT "fk_socio_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "postulante" ADD CONSTRAINT "fk_postulante_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cv" ADD CONSTRAINT "fk_cv_postulante" FOREIGN KEY ("postulante_id") REFERENCES "postulante"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oferta" ADD CONSTRAINT "fk_oferta_creador" FOREIGN KEY ("creada_por") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oferta" ADD CONSTRAINT "fk_oferta_socio" FOREIGN KEY ("socio_id") REFERENCES "socio"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oferta_categoria" ADD CONSTRAINT "fk_oferta_categoria_oferta" FOREIGN KEY ("oferta_id") REFERENCES "oferta"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oferta_categoria" ADD CONSTRAINT "fk_oferta_categoria_categoria" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "postulacion" ADD CONSTRAINT "fk_postulacion_oferta" FOREIGN KEY ("oferta_id") REFERENCES "oferta"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "postulacion" ADD CONSTRAINT "fk_postulacion_postulante" FOREIGN KEY ("postulante_id") REFERENCES "postulante"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

