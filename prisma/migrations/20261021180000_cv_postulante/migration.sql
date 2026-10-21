-- CreateEnum
CREATE TYPE "tipo_estudio" AS ENUM ('CURRICULAR', 'NO_CURRICULAR');

-- CreateEnum
CREATE TYPE "tipo_referencia" AS ENUM ('LABORAL', 'PERSONAL');

-- AlterTable
ALTER TABLE "cv" ADD COLUMN     "nombre_archivo" VARCHAR(255);

-- AlterTable
ALTER TABLE "postulante" ADD COLUMN     "direccion" VARCHAR(255),
ADD COLUMN     "fecha_nacimiento" DATE,
ADD COLUMN     "otros" TEXT;

-- CreateTable
CREATE TABLE "estudio" (
    "id" SERIAL NOT NULL,
    "postulante_id" INTEGER NOT NULL,
    "tipo" "tipo_estudio" NOT NULL,
    "institucion" VARCHAR(150) NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "fecha_inicio" DATE,
    "fecha_fin" DATE,
    "en_curso" BOOLEAN NOT NULL DEFAULT false,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "estudio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiencia_laboral" (
    "id" SERIAL NOT NULL,
    "postulante_id" INTEGER NOT NULL,
    "empresa" VARCHAR(150) NOT NULL,
    "cargo" VARCHAR(150) NOT NULL,
    "fecha_inicio" DATE,
    "fecha_fin" DATE,
    "actual" BOOLEAN NOT NULL DEFAULT false,
    "tareas" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "experiencia_laboral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referencia" (
    "id" SERIAL NOT NULL,
    "postulante_id" INTEGER NOT NULL,
    "tipo" "tipo_referencia" NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "relacion" VARCHAR(150),
    "telefono" VARCHAR(50),
    "email" VARCHAR(255),
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "referencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_estudio_postulante" ON "estudio"("postulante_id");

-- CreateIndex
CREATE INDEX "idx_experiencia_postulante" ON "experiencia_laboral"("postulante_id");

-- CreateIndex
CREATE INDEX "idx_referencia_postulante" ON "referencia"("postulante_id");

-- AddForeignKey
ALTER TABLE "estudio" ADD CONSTRAINT "fk_estudio_postulante" FOREIGN KEY ("postulante_id") REFERENCES "postulante"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "experiencia_laboral" ADD CONSTRAINT "fk_experiencia_postulante" FOREIGN KEY ("postulante_id") REFERENCES "postulante"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "referencia" ADD CONSTRAINT "fk_referencia_postulante" FOREIGN KEY ("postulante_id") REFERENCES "postulante"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
