-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigenTurno" AS ENUM ('SECRETARIA', 'PACIENTE');

-- CreateEnum
CREATE TYPE "CanalTurno" AS ENUM ('WEB', 'WHATSAPP', 'SISTEMA');

-- CreateEnum
CREATE TYPE "TipoEventoTurno" AS ENUM ('CREADO', 'CONFIRMADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "celular" TEXT;

-- CreateTable
CREATE TABLE "servicios" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "codigo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accesos_servicios_pacientes" (
    "id" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "servicioId" UUID NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,
    "habilitadoPorId" UUID NOT NULL,
    "habilitadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accesos_servicios_pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos" (
    "id" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "servicioId" UUID NOT NULL,
    "profesionalId" UUID,
    "fechaHora" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoTurno" NOT NULL DEFAULT 'PENDIENTE',
    "origen" "OrigenTurno" NOT NULL,
    "creadoPorId" UUID,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_turno" (
    "id" UUID NOT NULL,
    "turnoId" UUID NOT NULL,
    "usuarioId" UUID,
    "tipo" "TipoEventoTurno" NOT NULL,
    "canal" "CanalTurno" NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_turno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "servicios_codigo_key" ON "servicios"("codigo");

-- CreateIndex
CREATE INDEX "accesos_servicios_pacientes_pacienteId_habilitado_idx" ON "accesos_servicios_pacientes"("pacienteId", "habilitado");

-- CreateIndex
CREATE INDEX "accesos_servicios_pacientes_servicioId_habilitado_idx" ON "accesos_servicios_pacientes"("servicioId", "habilitado");

-- CreateIndex
CREATE UNIQUE INDEX "accesos_servicios_pacientes_pacienteId_servicioId_key" ON "accesos_servicios_pacientes"("pacienteId", "servicioId");

-- CreateIndex
CREATE INDEX "turnos_pacienteId_fechaHora_idx" ON "turnos"("pacienteId", "fechaHora");

-- CreateIndex
CREATE INDEX "turnos_profesionalId_fechaHora_idx" ON "turnos"("profesionalId", "fechaHora");

-- CreateIndex
CREATE INDEX "turnos_servicioId_fechaHora_idx" ON "turnos"("servicioId", "fechaHora");

-- CreateIndex
CREATE INDEX "turnos_estado_fechaHora_idx" ON "turnos"("estado", "fechaHora");

-- CreateIndex
CREATE INDEX "eventos_turno_turnoId_creadoEn_idx" ON "eventos_turno"("turnoId", "creadoEn");

-- CreateIndex
CREATE INDEX "eventos_turno_usuarioId_creadoEn_idx" ON "eventos_turno"("usuarioId", "creadoEn");

-- AddForeignKey
ALTER TABLE "accesos_servicios_pacientes" ADD CONSTRAINT "accesos_servicios_pacientes_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos_servicios_pacientes" ADD CONSTRAINT "accesos_servicios_pacientes_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accesos_servicios_pacientes" ADD CONSTRAINT "accesos_servicios_pacientes_habilitadoPorId_fkey" FOREIGN KEY ("habilitadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_profesionalId_fkey" FOREIGN KEY ("profesionalId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_turno" ADD CONSTRAINT "eventos_turno_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "turnos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_turno" ADD CONSTRAINT "eventos_turno_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
