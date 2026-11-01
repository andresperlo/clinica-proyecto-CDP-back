import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const COOKIE_NAME = "cdp_token";
const TIEMPO_MAXIMO_SIN_HEARTBEAT_MS = 30 * 1000;

export interface AuthRequest extends Request {
  usuario?: {
    id: string;
    rol: string;
    sesionId: string;
    dispositivoId: string;
    esPrincipal: boolean;
    expiresAt: Date;
  };
}

function calcularHashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function limpiarCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

async function revocarSesionCompartida(
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

export async function verificarToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token || typeof token !== "string") {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "No hay una sesión activa",
    });
    return;
  }

  try {
    const tokenHash = calcularHashToken(token);

    // Buscar el dispositivo mediante el hash de su token.
    const dispositivo = await prisma.dispositivo.findUnique({
      where: { tokenHash },
      include: {
        usuario: {
          select: {
            id: true,
            rol: true,
            estado: true,
          },
        },
        sesion: {
          include: {
            dispositivoPrincipal: true,
          },
        },
      },
    });

    if (
      !dispositivo ||
      dispositivo.estado !== "ACTIVO" ||
      dispositivo.sesion.estado !== "ACTIVA"
    ) {
      limpiarCookie(res);

      res.status(401).json({
        success: false,
        code: "INVALID_SESSION",
        message: "El dispositivo no tiene una sesión activa",
      });
      return;
    }

    const ahora = new Date();
    const sesion = dispositivo.sesion;

    // Verificar vencimiento de la sesión compartida.
    if (sesion.venceEn <= ahora) {
      await revocarSesionCompartida(
        sesion.id,
        dispositivo.usuarioId,
        "Tiempo máximo de sesión alcanzado",
        "SESION_EXPIRADA",
      );

      limpiarCookie(res);

      res.status(401).json({
        success: false,
        code: "SESSION_EXPIRED",
        message: "La sesión compartida ha vencido",
      });
      return;
    }

    // Verificar que el usuario siga habilitado.
    if (dispositivo.usuario.estado !== "ACTIVO") {
      limpiarCookie(res);

      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "El usuario no está disponible",
      });
      return;
    }

    // Comprobar que el dispositivo principal siga siendo válido.
    const principal = sesion.dispositivoPrincipal;

    if (
      !principal ||
      principal.estado !== "ACTIVO" ||
      !principal.esPrincipal ||
      principal.sesionId !== sesion.id ||
      principal.usuarioId !== sesion.usuarioId
    ) {
      await revocarSesionCompartida(
        sesion.id,
        dispositivo.usuarioId,
        "El dispositivo principal dejó de estar disponible",
        "PRINCIPAL_DESCONECTADO",
      );

      limpiarCookie(res);

      res.status(401).json({
        success: false,
        code: "PRIMARY_DEVICE_UNAVAILABLE",
        message: "La sesión principal ya no está disponible",
      });
      return;
    }

    // Contar los dispositivos activos de la sesión.
    const cantidadDispositivos = await prisma.dispositivo.count({
      where: {
        sesionId: sesion.id,
        estado: "ACTIVO",
      },
    });

    // El heartbeat se exige solamente cuando hay más de un dispositivo.
    if (cantidadDispositivos > 1) {
      // Las peticiones normales NO actualizan el heartbeat.
      // Solamente el endpoint dedicado /heartbeat puede hacerlo.
      if (!dispositivo.esPrincipal) {
        const ultimaSenal =
          sesion.ultimoHeartbeat ??
          principal.ultimoHeartbeat ??
          principal.creadoEn;

        const tiempoSinSenal = ahora.getTime() - ultimaSenal.getTime();

        if (tiempoSinSenal > TIEMPO_MAXIMO_SIN_HEARTBEAT_MS) {
          await revocarSesionCompartida(
            sesion.id,
            dispositivo.usuarioId,
            "El dispositivo principal perdió la conexión",
            "PRINCIPAL_DESCONECTADO",
          );

          limpiarCookie(res);

          res.status(401).json({
            success: false,
            code: "PRIMARY_DEVICE_DISCONNECTED",
            message:
              "El dispositivo principal perdió la conexión. Se cerraron todos los dispositivos.",
          });

          return;
        }
      }
    }

    // Adjuntar los datos de autenticación a la petición.
    req.usuario = {
      id: dispositivo.usuario.id,
      rol: dispositivo.usuario.rol,
      sesionId: sesion.id,
      dispositivoId: dispositivo.id,
      esPrincipal: dispositivo.esPrincipal,
      expiresAt: sesion.venceEn,
    };

    next();
  } catch (error) {
    console.error("Error al verificar la sesión:", error);

    res.status(500).json({
      success: false,
      code: "SESSION_CHECK_ERROR",
      message: "No se pudo verificar la sesión",
    });
  }
}
