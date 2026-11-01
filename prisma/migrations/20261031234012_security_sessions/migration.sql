-- CreateEnum
CREATE TYPE "EstadoSesion" AS ENUM ('ACTIVA', 'REVOCADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "EstadoSolicitudAcceso" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoCodigoVerificacion" AS ENUM ('PENDIENTE', 'UTILIZADO', 'EXPIRADO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "EstadoRecuperacion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoEventoSeguridad" AS ENUM ('LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'LOGOUT', 'SESION_EXPIRADA', 'SESION_REVOCADA', 'SEGUNDO_DISPOSITIVO_SOLICITADO', 'SEGUNDO_DISPOSITIVO_APROBADO', 'SEGUNDO_DISPOSITIVO_RECHAZADO', 'CODIGO_EMAIL_ENVIADO', 'CODIGO_EMAIL_VALIDADO', 'CODIGO_EMAIL_FALLIDO', 'RECUPERACION_SOLICITADA', 'RECUPERACION_APROBADA', 'RECUPERACION_RECHAZADA', 'PASSWORD_CAMBIADA');

-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "estado" "EstadoSesion" NOT NULL DEFAULT 'ACTIVA',
    "dispositivo" TEXT,
    "navegador" TEXT,
    "sistemaOperativo" TEXT,
    "ip" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "revocadoEn" TIMESTAMP(3),
    "motivoRevocacion" TEXT,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_acceso" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "estado" "EstadoSolicitudAcceso" NOT NULL DEFAULT 'PENDIENTE',
    "dispositivo" TEXT,
    "navegador" TEXT,
    "sistemaOperativo" TEXT,
    "ip" TEXT,
    "codigoAprobacionHash" TEXT,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "aprobadaEn" TIMESTAMP(3),
    "rechazadaEn" TIMESTAMP(3),
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigos_verificacion" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "estado" "EstadoCodigoVerificacion" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "utilizadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigos_verificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitudes_recuperacion" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "estado" "EstadoRecuperacion" NOT NULL DEFAULT 'PENDIENTE',
    "motivo" TEXT,
    "solicitadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisadoEn" TIMESTAMP(3),
    "revisadoPor" UUID,
    "completadoEn" TIMESTAMP(3),

    CONSTRAINT "solicitudes_recuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_seguridad" (
    "id" UUID NOT NULL,
    "usuarioId" UUID,
    "tipo" "TipoEventoSeguridad" NOT NULL,
    "descripcion" TEXT,
    "ip" TEXT,
    "dispositivo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_tokenHash_key" ON "sesiones"("tokenHash");

-- CreateIndex
CREATE INDEX "sesiones_usuarioId_estado_idx" ON "sesiones"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "sesiones_venceEn_idx" ON "sesiones"("venceEn");

-- CreateIndex
CREATE INDEX "solicitudes_acceso_usuarioId_estado_idx" ON "solicitudes_acceso"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_acceso_venceEn_idx" ON "solicitudes_acceso"("venceEn");

-- CreateIndex
CREATE INDEX "codigos_verificacion_usuarioId_estado_idx" ON "codigos_verificacion"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "codigos_verificacion_venceEn_idx" ON "codigos_verificacion"("venceEn");

-- CreateIndex
CREATE INDEX "solicitudes_recuperacion_usuarioId_estado_idx" ON "solicitudes_recuperacion"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "eventos_seguridad_usuarioId_creadoEn_idx" ON "eventos_seguridad"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "eventos_seguridad_tipo_creadoEn_idx" ON "eventos_seguridad"("tipo", "creadoEn");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_acceso" ADD CONSTRAINT "solicitudes_acceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigos_verificacion" ADD CONSTRAINT "codigos_verificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_recuperacion" ADD CONSTRAINT "solicitudes_recuperacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_seguridad" ADD CONSTRAINT "eventos_seguridad_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
