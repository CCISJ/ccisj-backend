-- AlterTable
ALTER TABLE "postulacion" ADD COLUMN     "cv_id" INTEGER;

-- AddForeignKey
ALTER TABLE "postulacion" ADD CONSTRAINT "fk_postulacion_cv" FOREIGN KEY ("cv_id") REFERENCES "cv"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
