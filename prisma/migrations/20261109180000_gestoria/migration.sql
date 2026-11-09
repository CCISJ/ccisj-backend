-- CreateTable
CREATE TABLE "gestion" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria" VARCHAR(80) NOT NULL,
    "creado_por_id" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivo_gestion" (
    "id" SERIAL NOT NULL,
    "gestion_id" INTEGER NOT NULL,
    "ruta" VARCHAR(500) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "tamano" INTEGER NOT NULL,
    "fecha_subida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivo_gestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gestion_categoria_idx" ON "gestion"("categoria");

-- CreateIndex
CREATE INDEX "archivo_gestion_gestion_id_idx" ON "archivo_gestion"("gestion_id");

-- AddForeignKey
ALTER TABLE "gestion" ADD CONSTRAINT "gestion_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivo_gestion" ADD CONSTRAINT "archivo_gestion_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "gestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

