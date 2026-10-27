/*
  Warnings:

  - You are about to drop the column `email` on the `envio_email` table. All the data in the column will be lost.
  - You are about to drop the column `fechaCreacion` on the `envio_email` table. All the data in the column will be lost.
  - You are about to drop the column `fechaEnvio` on the `envio_email` table. All the data in the column will be lost.
  - You are about to drop the column `resendId` on the `envio_email` table. All the data in the column will be lost.
  - You are about to drop the column `ultimoError` on the `envio_email` table. All the data in the column will be lost.
  - Added the required column `asunto` to the `envio_email` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contenido_html` to the `envio_email` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destinatario` to the `envio_email` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "envio_email_notificacion_id_usuario_id_key";

-- AlterTable
ALTER TABLE "envio_email" DROP COLUMN "email",
DROP COLUMN "fechaCreacion",
DROP COLUMN "fechaEnvio",
DROP COLUMN "resendId",
DROP COLUMN "ultimoError",
ADD COLUMN     "asunto" VARCHAR(255) NOT NULL,
ADD COLUMN     "contenido_html" TEXT NOT NULL,
ADD COLUMN     "destinatario" VARCHAR(255) NOT NULL,
ADD COLUMN     "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "fecha_envio" TIMESTAMP(3),
ADD COLUMN     "proximo_intento" TIMESTAMP(3),
ADD COLUMN     "resend_id" TEXT,
ADD COLUMN     "ultimo_error" TEXT;

-- CreateIndex
CREATE INDEX "envio_email_estado_proximo_intento_idx" ON "envio_email"("estado", "proximo_intento");

-- CreateIndex
CREATE INDEX "envio_email_notificacion_id_idx" ON "envio_email"("notificacion_id");
