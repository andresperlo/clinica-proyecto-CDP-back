import type { Request, Response } from "express";

import { createHash } from "node:crypto";

import {
  login,
  register,
  getCurrentUser,
  solicitarCodigoSegundoDispositivo,
  verificarCodigoSegundoDispositivo,
  listarSolicitudesPendientesSegundoDispositivo,
  aprobarSegundoDispositivo,
  rechazarSegundoDispositivo,
  cancelarSolicitudSegundoDispositivo,
  completarVinculacionSegundoDispositivo,
  registrarHeartbeatPrincipal,
  consultarEstadoSolicitudSegundoDispositivo,
} from "../services/auth.service.js";

import type { AuthRequest } from "../middlewares/auth.middleware.js";

import { prisma } from "../lib/prisma.js";

// ------------------------------------------------------
// CONFIGURACIÓN
// ------------------------------------------------------

const COOKIE_NAME = "cdp_token";
const CHALLENGE_COOKIE_NAME = "cdp_access_challenge";

const DURACION_SESION_MS = 8 * 60 * 60 * 1000;
const DURACION_SOLICITUD_MS = 10 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: DURACION_SESION_MS,
};

const challengeCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: DURACION_SOLICITUD_MS,
};

// ------------------------------------------------------
// FUNCIONES AUXILIARES
// ------------------------------------------------------

function limpiarCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function limpiarChallengeCookie(res: Response) {
  res.clearCookie(CHALLENGE_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function calcularHashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function obtenerDatosDispositivo(req: Request) {
  const userAgent = req.get("user-agent");
  const ip = req.ip;

  return {
    ...(userAgent && {
      dispositivo: userAgent.slice(0, 250),
      navegador: userAgent.slice(0, 250),
    }),
    ...(ip && { ip }),
  };
}

function obtenerDatosAutenticados(req: AuthRequest) {
  if (!req.usuario) {
    throw new Error("No hay una sesión autenticada");
  }

  return {
    usuarioId: req.usuario.id,
    sesionId: req.usuario.sesionId,
    dispositivoId: req.usuario.dispositivoId,
    esPrincipal: req.usuario.esPrincipal,
  };
}

// ------------------------------------------------------
// INICIAR SESIÓN
// ------------------------------------------------------

export async function loginController(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    res.status(400).json({
      success: false,
      message: "Email y contraseña son obligatorios",
    });
    return;
  }

  try {
    const resultado = await login(
      { email, password },
      obtenerDatosDispositivo(req),
    );

    res.cookie(COOKIE_NAME, resultado.token, cookieOptions);

    limpiarChallengeCookie(res);

    res.status(200).json({
      success: true,
      message: "Inicio de sesión correcto",
      data: {
        usuario: resultado.usuario,
        expiresAt: resultado.expiresAt.getTime(),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Credenciales inválidas") {
        res.status(401).json({
          success: false,
          message: "Email o contraseña incorrectos",
        });
        return;
      }

      if (error.message.includes("Ya existe una sesión activa")) {
        try {
          const usuario = await prisma.usuario.findUnique({
            where: {
              email: email.trim().toLowerCase(),
            },
            select: {
              id: true,
              estado: true,
            },
          });

          if (!usuario || usuario.estado !== "ACTIVO") {
            res.status(401).json({
              success: false,
              message: "No se pudo procesar el acceso",
            });
            return;
          }

          const solicitud = await solicitarCodigoSegundoDispositivo(
            usuario.id,
            obtenerDatosDispositivo(req),
          );

          // Guardar el secreto temporal en una cookie HttpOnly.
          res.cookie(
            CHALLENGE_COOKIE_NAME,
            solicitud.challengeToken,
            challengeCookieOptions,
          );

          res.status(202).json({
            success: true,
            requiresVerification: true,
            message:
              "Enviamos un código al correo registrado. Después deberás obtener la aprobación del dispositivo principal.",
            data: {
              solicitudId: solicitud.solicitudId,
              emailDestino: solicitud.emailDestino,
              expiresAt: solicitud.venceEn.getTime(),
              opciones: solicitud.opciones,
            },
          });

          return;
        } catch (solicitudError) {
          if (solicitudError instanceof Error) {
            if (solicitudError.message.includes("esperar cinco minutos")) {
              res.status(429).json({
                success: false,
                code: "VERIFICATION_TEMPORARILY_BLOCKED",
                message: solicitudError.message,
              });
              return;
            }

            if (
              solicitudError.message.includes(
                "No existe un dispositivo principal autorizado activo",
              )
            ) {
              res.status(409).json({
                success: false,
                code: "ACTIVE_SESSION_NOT_AVAILABLE",
                message:
                  "La sesión anterior ya no está disponible. Intentá iniciar sesión nuevamente.",
              });
              return;
            }
          }

          console.error(
            "No se pudo generar la solicitud de segundo dispositivo.",
          );

          res.status(500).json({
            success: false,
            message: "No se pudo enviar el código de verificación",
          });
          return;
        }
      }
    }

    console.error("Error en el inicio de sesión:", error);

    res.status(500).json({
      success: false,
      message: "Error interno al iniciar sesión",
    });
  }
}

// ------------------------------------------------------
// REGISTRAR PACIENTE
// ------------------------------------------------------

export async function registerController(req: Request, res: Response) {
  const { nombre, apellido, email, password } = req.body ?? {};

  if (
    typeof nombre !== "string" ||
    typeof apellido !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    res.status(400).json({
      success: false,
      message: "Todos los campos son obligatorios",
    });
    return;
  }

  try {
    const resultado = await register(
      {
        nombre,
        apellido,
        email,
        password,
      },
      obtenerDatosDispositivo(req),
    );

    res.cookie(COOKIE_NAME, resultado.token, cookieOptions);

    limpiarChallengeCookie(res);

    res.status(201).json({
      success: true,
      message: "Cuenta creada correctamente",
      data: {
        usuario: resultado.usuario,
        expiresAt: resultado.expiresAt.getTime(),
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "El correo electrónico ya está registrado") {
        res.status(409).json({
          success: false,
          message: error.message,
        });
        return;
      }

      if (
        error.message === "La contraseña debe tener al menos 8 caracteres" ||
        error.message === "Todos los campos son obligatorios"
      ) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
        return;
      }
    }

    console.error("Error en el registro:", error);

    res.status(500).json({
      success: false,
      message: "Error interno al registrar el usuario",
    });
  }
}

// ------------------------------------------------------
// VERIFICAR CÓDIGO DE SEGUNDO DISPOSITIVO
// ------------------------------------------------------

export async function verificarCodigoController(req: Request, res: Response) {
  const { solicitudId, codigo } = req.body ?? {};

  const challengeToken = req.cookies?.[CHALLENGE_COOKIE_NAME];

  if (
    typeof solicitudId !== "string" ||
    typeof codigo !== "string" ||
    !solicitudId.trim() ||
    !/^\d{6}$/.test(codigo) ||
    typeof challengeToken !== "string"
  ) {
    res.status(400).json({
      success: false,
      message:
        "La solicitud, el código o la autorización temporal no son válidos",
    });
    return;
  }

  try {
    const solicitud = await prisma.solicitudAcceso.findFirst({
      where: {
        id: solicitudId,
        challengeTokenHash: calcularHashToken(challengeToken),
      },
      select: {
        usuarioId: true,
      },
    });

    if (!solicitud) {
      res.status(400).json({
        success: false,
        message: "La solicitud o el código ya no son válidos",
      });
      return;
    }

    const resultado = await verificarCodigoSegundoDispositivo(
      solicitud.usuarioId,
      solicitudId,
      codigo,
      challengeToken,
    );

    res.status(200).json({
      success: true,
      message: resultado.mensaje,
      data: {
        verificado: resultado.verificado,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes("tres intentos") ||
        error.message.includes("bloqueado")
      ) {
        res.status(429).json({
          success: false,
          code: "VERIFICATION_ATTEMPTS_EXCEEDED",
          message: error.message,
        });
        return;
      }

      if (
        error.message === "Código incorrecto" ||
        error.message.includes("ya no son válidos") ||
        error.message.includes("venció") ||
        error.message.includes("ya fue utilizado")
      ) {
        res.status(400).json({
          success: false,
          code: "INVALID_VERIFICATION_CODE",
          message: error.message,
        });
        return;
      }
    }

    console.error("Error al verificar el código de acceso.");

    res.status(500).json({
      success: false,
      message: "No se pudo verificar el código",
    });
  }
}

// ------------------------------------------------------
// LISTAR SOLICITUDES PARA EL DISPOSITIVO PRINCIPAL
// ------------------------------------------------------

export async function solicitudesPendientesController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { usuarioId, sesionId, dispositivoId, esPrincipal } =
      obtenerDatosAutenticados(req);

    if (!esPrincipal) {
      res.status(403).json({
        success: false,
        message:
          "Solo el dispositivo principal puede consultar estas solicitudes",
      });
      return;
    }

    const solicitudes = await listarSolicitudesPendientesSegundoDispositivo(
      usuarioId,
      sesionId,
      dispositivoId,
    );

    res.status(200).json({
      success: true,
      data: {
        solicitudes,
      },
    });
  } catch (error) {
    console.error("Error al consultar solicitudes pendientes.", error);

    res.status(403).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudieron consultar las solicitudes",
    });
  }
}

// ------------------------------------------------------
// APROBAR SEGUNDO DISPOSITIVO
// ------------------------------------------------------

export async function aprobarSegundoDispositivoController(
  req: AuthRequest,
  res: Response,
) {
  const { solicitudId, codigo } = req.body ?? {};

  if (
    typeof solicitudId !== "string" ||
    typeof codigo !== "string" ||
    !solicitudId.trim() ||
    !/^\d{3}$/.test(codigo)
  ) {
    res.status(400).json({
      success: false,
      message:
        "Debés proporcionar la solicitud y el número de aprobación de tres dígitos",
    });
    return;
  }

  try {
    const { usuarioId, sesionId, dispositivoId, esPrincipal } =
      obtenerDatosAutenticados(req);

    if (!esPrincipal) {
      res.status(403).json({
        success: false,
        message: "Solo el dispositivo principal puede aprobar otro dispositivo",
      });
      return;
    }

    const resultado = await aprobarSegundoDispositivo(
      usuarioId,
      sesionId,
      dispositivoId,
      solicitudId,
      codigo,
    );

    res.status(200).json({
      success: true,
      message: resultado.mensaje,
      data: {
        aprobado: resultado.aprobado,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("número seleccionado")
    ) {
      res.status(400).json({
        success: false,
        code: "INVALID_APPROVAL_CODE",
        message: error.message,
      });
      return;
    }

    console.error("Error al aprobar segundo dispositivo.");

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo aprobar el dispositivo",
    });
  }
}

// ------------------------------------------------------
// RECHAZAR SEGUNDO DISPOSITIVO
// ------------------------------------------------------

export async function rechazarSegundoDispositivoController(
  req: AuthRequest,
  res: Response,
) {
  const { solicitudId } = req.body ?? {};

  if (typeof solicitudId !== "string" || !solicitudId.trim()) {
    res.status(400).json({
      success: false,
      message: "Debés proporcionar la solicitud",
    });
    return;
  }

  try {
    const { usuarioId, sesionId, dispositivoId, esPrincipal } =
      obtenerDatosAutenticados(req);

    if (!esPrincipal) {
      res.status(403).json({
        success: false,
        message: "Solo el dispositivo principal puede rechazar solicitudes",
      });
      return;
    }

    const resultado = await rechazarSegundoDispositivo(
      usuarioId,
      sesionId,
      dispositivoId,
      solicitudId,
    );

    res.status(200).json({
      success: true,
      message: resultado.mensaje,
      data: {
        rechazado: resultado.rechazado,
      },
    });
  } catch (error) {
    console.error("Error al rechazar segundo dispositivo.");

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo rechazar el dispositivo",
    });
  }
}

// ------------------------------------------------------
// CANCELAR SOLICITUD DEL SEGUNDO DISPOSITIVO
// ------------------------------------------------------

export async function cancelarSolicitudController(req: Request, res: Response) {
  const { solicitudId } = req.body ?? {};

  const challengeToken = req.cookies?.[CHALLENGE_COOKIE_NAME];

  if (
    typeof solicitudId !== "string" ||
    !solicitudId.trim() ||
    typeof challengeToken !== "string" ||
    !challengeToken
  ) {
    res.status(400).json({
      success: false,
      message: "La solicitud o la autorización temporal no son válidas",
    });
    return;
  }

  try {
    const resultado = await cancelarSolicitudSegundoDispositivo(
      solicitudId,
      challengeToken,
    );

    if (resultado.cancelada) {
      limpiarChallengeCookie(res);
    }

    res.status(200).json({
      success: true,
      message: resultado.mensaje,
      data: {
        cancelada: resultado.cancelada,
      },
    });
  } catch (error) {
    console.error("Error al cancelar la solicitud de acceso.");

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo cancelar la solicitud",
    });
  }
}

// ------------------------------------------------------
// COMPLETAR VINCULACIÓN DEL SEGUNDO DISPOSITIVO
// ------------------------------------------------------

export async function completarVinculacionController(
  req: Request,
  res: Response,
) {
  const { solicitudId } = req.body ?? {};

  const challengeToken = req.cookies?.[CHALLENGE_COOKIE_NAME];

  if (
    typeof solicitudId !== "string" ||
    !solicitudId.trim() ||
    typeof challengeToken !== "string"
  ) {
    res.status(400).json({
      success: false,
      message: "La solicitud o la autorización temporal no son válidas",
    });
    return;
  }

  try {
    const resultado = await completarVinculacionSegundoDispositivo(
      solicitudId,
      challengeToken,
      obtenerDatosDispositivo(req),
    );

    // El segundo dispositivo recibe su propio token.
    res.cookie(COOKIE_NAME, resultado.token, {
      ...cookieOptions,
      maxAge: Math.max(0, resultado.expiresAt.getTime() - Date.now()),
    });

    // El secreto temporal ya no es necesario.
    limpiarChallengeCookie(res);

    res.status(200).json({
      success: true,
      message: "Dispositivo vinculado correctamente",
      data: {
        expiresAt: resultado.expiresAt.getTime(),
      },
    });
  } catch (error) {
    console.error("Error al completar la vinculación.");

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo completar la vinculación",
    });
  }
}

// ------------------------------------------------------
// HEARTBEAT DEL DISPOSITIVO PRINCIPAL
// ------------------------------------------------------

export async function heartbeatPrincipalController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { usuarioId, sesionId, dispositivoId, esPrincipal } =
      obtenerDatosAutenticados(req);

    if (!esPrincipal) {
      res.status(403).json({
        success: false,
        message: "Este endpoint es exclusivo del dispositivo principal",
      });
      return;
    }

    const resultado = await registrarHeartbeatPrincipal(
      usuarioId,
      sesionId,
      dispositivoId,
    );

    res.status(200).json({
      success: true,
      data: resultado,
    });
  } catch (error) {
    console.error("Error al registrar heartbeat principal.");

    res.status(403).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo registrar la conexión",
    });
  }
}

// ------------------------------------------------------
// CONSULTAR SESIÓN ACTUAL
// ------------------------------------------------------

export async function meController(req: AuthRequest, res: Response) {
  try {
    if (!req.usuario) {
      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "No hay una sesión activa",
      });
      return;
    }

    const usuario = await getCurrentUser(req.usuario.id);

    if (!usuario || usuario.estado !== "ACTIVO") {
      limpiarCookie(res);

      res.status(401).json({
        success: false,
        code: "UNAUTHORIZED",
        message: "El usuario no está disponible",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          email: usuario.email,
          rol: usuario.rol,
        },
        expiresAt: req.usuario.expiresAt.getTime(),
      },
    });
  } catch (error) {
    console.error("Error al consultar la sesión:", error);

    res.status(500).json({
      success: false,
      message: "Error al consultar la sesión",
    });
  }
}

// ------------------------------------------------------
// CERRAR SESIÓN
// ------------------------------------------------------

export async function logoutController(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE_NAME];

    if (typeof token === "string" && token.length > 0) {
      const tokenHash = calcularHashToken(token);

      const dispositivo = await prisma.dispositivo.findUnique({
        where: {
          tokenHash,
        },
        select: {
          id: true,
          usuarioId: true,
          sesionId: true,
        },
      });

      if (dispositivo) {
        await prisma.$transaction(async (tx) => {
          const ahora = new Date();

          const resultado = await tx.sesion.updateMany({
            where: {
              id: dispositivo.sesionId,
              usuarioId: dispositivo.usuarioId,
              estado: "ACTIVA",
            },
            data: {
              estado: "REVOCADA",
              revocadoEn: ahora,
              motivoRevocacion: "Cierre de sesión voluntario",
            },
          });

          if (resultado.count > 0) {
            await tx.dispositivo.updateMany({
              where: {
                sesionId: dispositivo.sesionId,
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
                usuarioId: dispositivo.usuarioId,
                tipo: "LOGOUT",
                descripcion: "Cierre de sesión compartida desde un dispositivo",
              },
            });
          }
        });
      }
    }

    limpiarCookie(res);
    limpiarChallengeCookie(res);

    res.status(200).json({
      success: true,
      message: "Sesión cerrada correctamente",
    });
  } catch (error) {
    console.error("Error al cerrar sesión.");

    limpiarCookie(res);
    limpiarChallengeCookie(res);

    res.status(500).json({
      success: false,
      message: "No se pudo cerrar la sesión correctamente",
    });
  }
}

// ------------------------------------------------------
// CONSULTAR ESTADO DE SOLICITUD DEL SEGUNDO DISPOSITIVO
// ------------------------------------------------------

export async function consultarEstadoSolicitudController(
  req: Request,
  res: Response,
) {
  const { solicitudId } = req.query;

  const challengeToken = req.cookies?.[CHALLENGE_COOKIE_NAME];

  if (
    typeof solicitudId !== "string" ||
    !solicitudId.trim() ||
    typeof challengeToken !== "string" ||
    !challengeToken
  ) {
    res.status(400).json({
      success: false,
      message: "La solicitud o la autorización temporal no son válidas",
    });
    return;
  }

  try {
    const resultado = await consultarEstadoSolicitudSegundoDispositivo(
      solicitudId,
      challengeToken,
    );

    const estadosFinales = ["REJECTED", "EXPIRED", "CANCELLED", "COMPLETED"];

    if (estadosFinales.includes(resultado.estado)) {
      limpiarChallengeCookie(res);
    }

    res.status(200).json({
      success: true,
      data: resultado,
    });
  } catch (error) {
    console.error("Error al consultar el estado de la solicitud.");

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo consultar el estado de la solicitud",
    });
  }
}
