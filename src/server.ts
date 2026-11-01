import app from "./app.js";
import { prisma } from "./lib/prisma.js";

const PORT = Number(process.env.PORT) || 3001;

const INTERVALO_MONITOR_MS = 5 * 1000;
const TIEMPO_MAXIMO_SIN_HEARTBEAT_MS = 30 * 1000;

let monitorEnEjecucion = false;

async function revocarSesion(
  sesionId: string,
  usuarioId: string,
  motivo: string,
  evento: "SESION_EXPIRADA" | "PRINCIPAL_DESCONECTADO",
) {
  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    const resultado = await tx.sesion.updateMany({
      where: {
        id: sesionId,
        estado: "ACTIVA",
      },
      data: {
        estado: evento === "SESION_EXPIRADA" ? "VENCIDA" : "REVOCADA",
        revocadoEn: ahora,
        motivoRevocacion: motivo,
        ...(evento === "PRINCIPAL_DESCONECTADO"
          ? { principalDesconectadoEn: ahora }
          : {}),
      },
    });

    // Evita registrar dos veces el mismo evento si otra revisión
    // ya revocó la sesión.
    if (resultado.count === 0) return;

    await tx.dispositivo.updateMany({
      where: {
        sesionId,
        estado: {
          in: ["ACTIVO", "DESCONECTADO"],
        },
      },
      data: {
        estado: "REVOCADO",
        revocadoEn: ahora,
      },
    });

    await tx.eventoSeguridad.create({
      data: {
        usuarioId,
        tipo: evento,
        descripcion: motivo,
      },
    });
  });
}

async function revisarSesionesActivas(): Promise<void> {
  if (monitorEnEjecucion) return;

  monitorEnEjecucion = true;

  try {
    const sesiones = await prisma.sesion.findMany({
      where: {
        estado: "ACTIVA",
      },
      select: {
        id: true,
        usuarioId: true,
        venceEn: true,
        ultimoHeartbeat: true,
      },
    });

    const ahora = new Date();

    for (const sesion of sesiones) {
      // 1. Comprobar vencimiento de las 8 horas.
      if (sesion.venceEn <= ahora) {
        await revocarSesion(
          sesion.id,
          sesion.usuarioId,
          "Tiempo máximo de sesión alcanzado",
          "SESION_EXPIRADA",
        );

        continue;
      }

      // 2. Contar los dispositivos activos.
      const cantidadDispositivos = await prisma.dispositivo.count({
        where: {
          sesionId: sesion.id,
          estado: "ACTIVO",
        },
      });

      // 3. Buscar el dispositivo principal.
      const principal = await prisma.dispositivo.findFirst({
        where: {
          sesionId: sesion.id,
          esPrincipal: true,
        },
        select: {
          id: true,
          usuarioId: true,
          sesionId: true,
          estado: true,
          ultimoHeartbeat: true,
          creadoEn: true,
        },
      });

      // Si el principal ya no existe o dejó de estar activo,
      // se revoca la sesión compartida.
      if (
        !principal ||
        principal.estado !== "ACTIVO" ||
        principal.usuarioId !== sesion.usuarioId ||
        principal.sesionId !== sesion.id
      ) {
        await revocarSesion(
          sesion.id,
          sesion.usuarioId,
          "El dispositivo principal dejó de estar disponible",
          "PRINCIPAL_DESCONECTADO",
        );

        continue;
      }

      // 4. Si solamente existe el dispositivo principal,
      // no se aplica el control de heartbeat.
      if (cantidadDispositivos <= 1) {
        continue;
      }

      // 5. Comprobar la última señal del dispositivo principal.
      const ultimaSenal =
        sesion.ultimoHeartbeat ??
        principal.ultimoHeartbeat ??
        principal.creadoEn;

      const tiempoSinSenal = ahora.getTime() - ultimaSenal.getTime();

      if (tiempoSinSenal > TIEMPO_MAXIMO_SIN_HEARTBEAT_MS) {
        await revocarSesion(
          sesion.id,
          sesion.usuarioId,
          "El dispositivo principal perdió la conexión",
          "PRINCIPAL_DESCONECTADO",
        );
      }
    }
  } catch (error) {
    console.error("Error al revisar las sesiones activas:", error);
  } finally {
    monitorEnEjecucion = false;
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`🩺 Health check: http://localhost:${PORT}/api/health`);

  // Primera revisión al iniciar el servidor.
  void revisarSesionesActivas();

  // Revisar las sesiones cada 5 segundos.
  setInterval(() => {
    void revisarSesionesActivas();
  }, INTERVALO_MONITOR_MS);

  console.log("🔐 Monitor de sesiones iniciado");
});
