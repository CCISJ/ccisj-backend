-- CreateTable
CREATE TABLE "postulante_categoria" (
    "postulante_id" INTEGER NOT NULL,
    "categoria_id" INTEGER NOT NULL,

    CONSTRAINT "postulante_categoria_pkey" PRIMARY KEY ("postulante_id","categoria_id")
);

-- AddForeignKey
ALTER TABLE "postulante_categoria" ADD CONSTRAINT "fk_postulante_categoria_postulante" FOREIGN KEY ("postulante_id") REFERENCES "postulante"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "postulante_categoria" ADD CONSTRAINT "fk_postulante_categoria_categoria" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
