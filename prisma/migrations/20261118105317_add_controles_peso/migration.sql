-- CreateTable
CREATE TABLE "controles_peso" (
    "id" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "profesionalId" UUID NOT NULL,
    "pesoKg" DECIMAL(6,3) NOT NULL,
    "alturaMetros" DECIMAL(4,2),
    "fechaControl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,

    CONSTRAINT "controles_peso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controles_peso_pacienteId_fechaControl_idx" ON "controles_peso"("pacienteId", "fechaControl");

-- CreateIndex
CREATE INDEX "controles_peso_profesionalId_fechaControl_idx" ON "controles_peso"("profesionalId", "fechaControl");

-- AddForeignKey
ALTER TABLE "controles_peso" ADD CONSTRAINT "controles_peso_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controles_peso" ADD CONSTRAINT "controles_peso_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
