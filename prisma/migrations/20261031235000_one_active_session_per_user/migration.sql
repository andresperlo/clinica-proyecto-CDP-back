-- Garantiza que cada usuario tenga como máximo una sesión activa.
CREATE UNIQUE INDEX "sesiones_unica_sesion_activa_por_usuario"
ON "sesiones" ("usuarioId")
WHERE "estado" = 'ACTIVA';