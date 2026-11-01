-- AlterTable
ALTER TABLE "solicitudes_acceso" ADD COLUMN     "aprobadaPorSesionId" UUID;

-- CreateIndex
CREATE INDEX "solicitudes_acceso_aprobadaPorSesionId_idx" ON "solicitudes_acceso"("aprobadaPorSesionId");

-- AddForeignKey
ALTER TABLE "solicitudes_acceso" ADD CONSTRAINT "solicitudes_acceso_aprobadaPorSesionId_fkey" FOREIGN KEY ("aprobadaPorSesionId") REFERENCES "sesiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
