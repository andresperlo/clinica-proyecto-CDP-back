-- AlterTable
ALTER TABLE "codigos_verificacion" ADD COLUMN     "bloqueadoHasta" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "codigos_verificacion_bloqueadoHasta_idx" ON "codigos_verificacion"("bloqueadoHasta");
