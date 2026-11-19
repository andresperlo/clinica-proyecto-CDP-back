-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO');

-- CreateEnum
CREATE TYPE "TipoExcepcionAgenda" AS ENUM ('CERRADO', 'HORARIO_ESPECIAL');

-- CreateTable
CREATE TABLE "horarios_clinica" (
    "id" UUID NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "horaApertura" TIME(0) NOT NULL,
    "horaCierre" TIME(0) NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "horarios_clinica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excepciones_agenda" (
    "id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "TipoExcepcionAgenda" NOT NULL,
    "horaApertura" TIME(0),
    "horaCierre" TIME(0),
    "motivo" TEXT NOT NULL,
    "creadoPorId" UUID NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excepciones_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "horarios_clinica_diaSemana_key" ON "horarios_clinica"("diaSemana");

-- CreateIndex
CREATE INDEX "excepciones_agenda_fecha_idx" ON "excepciones_agenda"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "excepciones_agenda_fecha_key" ON "excepciones_agenda"("fecha");

-- AddForeignKey
ALTER TABLE "excepciones_agenda" ADD CONSTRAINT "excepciones_agenda_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
