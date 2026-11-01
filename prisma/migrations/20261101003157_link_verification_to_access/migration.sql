/*
  Warnings:

  - Added the required column `solicitudAccesoId` to the `codigos_verificacion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "codigos_verificacion" ADD COLUMN     "solicitudAccesoId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "solicitudes_acceso" ADD COLUMN     "emailVerificadoEn" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "codigos_verificacion_solicitudAccesoId_estado_idx" ON "codigos_verificacion"("solicitudAccesoId", "estado");

-- AddForeignKey
ALTER TABLE "codigos_verificacion" ADD CONSTRAINT "codigos_verificacion_solicitudAccesoId_fkey" FOREIGN KEY ("solicitudAccesoId") REFERENCES "solicitudes_acceso"("id") ON DELETE CASCADE ON UPDATE CASCADE;
