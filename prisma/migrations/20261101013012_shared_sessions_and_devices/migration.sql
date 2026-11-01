
-- =========================================================
-- MIGRACION: SESIONES COMPARTIDAS Y DISPOSITIVOS
-- Conserva tokens y metadatos de sesiones existentes.
-- =========================================================

-- 1. Crear nuevos enums

CREATE TYPE "EstadoDispositivo" AS ENUM (
    'ACTIVO',
    'DESCONECTADO',
    'REVOCADO'
);

ALTER TYPE "EstadoSolicitudAcceso"
ADD VALUE 'COMPLETADA';

ALTER TYPE "TipoEventoSeguridad"
ADD VALUE 'DISPOSITIVO_VINCULADO';

ALTER TYPE "TipoEventoSeguridad"
ADD VALUE 'DISPOSITIVO_DESCONECTADO';

ALTER TYPE "TipoEventoSeguridad"
ADD VALUE 'DISPOSITIVO_REVOCADO';

ALTER TYPE "TipoEventoSeguridad"
ADD VALUE 'PRINCIPAL_DESCONECTADO';

-- 2. Agregar columnas a sesiones

ALTER TABLE "sesiones"
ADD COLUMN "dispositivoPrincipalId" UUID,
ADD COLUMN "principalDesconectadoEn" TIMESTAMP(3),
ADD COLUMN "ultimoHeartbeat" TIMESTAMP(3);

-- 3. Agregar columnas a solicitudes de acceso

ALTER TABLE "solicitudes_acceso"
ADD COLUMN "challengeTokenHash" TEXT,
ADD COLUMN "completadaEn" TIMESTAMP(3);

-- 4. Crear tabla dispositivos

CREATE TABLE "dispositivos" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "sesionId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "estado" "EstadoDispositivo" NOT NULL DEFAULT 'ACTIVO',
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "nombre" TEXT,
    "tipo" TEXT,
    "navegador" TEXT,
    "sistemaOperativo" TEXT,
    "ip" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoHeartbeat" TIMESTAMP(3),
    "desconectadoEn" TIMESTAMP(3),
    "revocadoEn" TIMESTAMP(3),

    CONSTRAINT "dispositivos_pkey"
    PRIMARY KEY ("id")
);

-- 5. Copiar los dispositivos existentes.
-- Las sesiones activas conservan su dispositivo principal.
-- Las sesiones revocadas conservan su token como histórico,
-- pero no se consideran dispositivos principales.

INSERT INTO "dispositivos" (
    "id",
    "usuarioId",
    "sesionId",
    "tokenHash",
    "estado",
    "esPrincipal",
    "nombre",
    "navegador",
    "sistemaOperativo",
    "ip",
    "creadoEn",
    "revocadoEn"
)
SELECT
    gen_random_uuid(),
    s."usuarioId",
    s."id",
    s."tokenHash",
    CASE
        WHEN s."estado" = 'ACTIVA'::"EstadoSesion"
        THEN 'ACTIVO'::"EstadoDispositivo"
        ELSE 'REVOCADO'::"EstadoDispositivo"
    END,
    s."estado" = 'ACTIVA'::"EstadoSesion",
    s."dispositivo",
    s."navegador",
    s."sistemaOperativo",
    s."ip",
    s."creadoEn",
    s."revocadoEn"
FROM "sesiones" s;

-- 6. Vincular cada sesión activa con su dispositivo principal.

UPDATE "sesiones" s
SET "dispositivoPrincipalId" = d."id"
FROM "dispositivos" d
WHERE d."sesionId" = s."id"
AND d."esPrincipal" = true;

-- 7. Crear índices de dispositivos.

CREATE UNIQUE INDEX "dispositivos_tokenHash_key"
ON "dispositivos"("tokenHash");

CREATE INDEX "dispositivos_usuarioId_estado_idx"
ON "dispositivos"("usuarioId", "estado");

CREATE INDEX "dispositivos_sesionId_estado_idx"
ON "dispositivos"("sesionId", "estado");

CREATE INDEX "dispositivos_sesionId_esPrincipal_idx"
ON "dispositivos"("sesionId", "esPrincipal");

-- 8. Crear índices de las nuevas relaciones.

CREATE UNIQUE INDEX "sesiones_dispositivoPrincipalId_key"
ON "sesiones"("dispositivoPrincipalId");

CREATE UNIQUE INDEX "solicitudes_acceso_challengeTokenHash_key"
ON "solicitudes_acceso"("challengeTokenHash");

-- 9. Crear claves foráneas de dispositivos.

ALTER TABLE "dispositivos"
ADD CONSTRAINT "dispositivos_usuarioId_fkey"
FOREIGN KEY ("usuarioId")
REFERENCES "usuarios"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "dispositivos"
ADD CONSTRAINT "dispositivos_sesionId_fkey"
FOREIGN KEY ("sesionId")
REFERENCES "sesiones"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- 10. Relacionar la sesión con su dispositivo principal.

ALTER TABLE "sesiones"
ADD CONSTRAINT "sesiones_dispositivoPrincipalId_fkey"
FOREIGN KEY ("dispositivoPrincipalId")
REFERENCES "dispositivos"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- 11. Eliminar columnas antiguas.
-- Los tokens y metadatos ya fueron trasladados.

DROP INDEX "sesiones_tokenHash_key";

ALTER TABLE "sesiones"
DROP COLUMN "tokenHash",
DROP COLUMN "dispositivo",
DROP COLUMN "ip",
DROP COLUMN "navegador",
DROP COLUMN "sistemaOperativo";
