import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";

import {
  consultarHistorialSeguridad,
  contarHistorialParaEliminar,
  eliminarHistorialPorRango,
  eliminarTodoElHistorial,
} from "../services/seguridad.service.js";

// ------------------------------------------------------
// FUNCIONES AUXILIARES
// ------------------------------------------------------

function obtenerUsuarioAutenticado(req: AuthRequest) {
  if (!req.usuario) {
    throw new Error("No hay una sesión autenticada");
  }

  return {
    usuarioId: req.usuario.id,
    rol: req.usuario.rol,
  };
}

function responderError(res: Response, error: unknown) {
  const mensaje =
    error instanceof Error ? error.message : "Ocurrió un error inesperado";

  const esPermisoDenegado = mensaje.includes("permisos");
  const esValidacion = !esPermisoDenegado;

  res.status(esPermisoDenegado ? 403 : esValidacion ? 400 : 500).json({
    success: false,
    message: mensaje,
  });
}

// ------------------------------------------------------
// CONSULTAR HISTORIAL DE SEGURIDAD
// ------------------------------------------------------

export async function consultarHistorialController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { usuarioId, rol } = obtenerUsuarioAutenticado(req);

    const desde =
      typeof req.query.desde === "string" ? req.query.desde : undefined;

    const hasta =
      typeof req.query.hasta === "string" ? req.query.hasta : undefined;

    const pagina =
      typeof req.query.pagina === "string" ? Number(req.query.pagina) : 1;

    const limite =
      typeof req.query.limite === "string" ? Number(req.query.limite) : 20;

    if (
      !Number.isInteger(pagina) ||
      !Number.isInteger(limite) ||
      pagina < 1 ||
      limite < 1
    ) {
      res.status(400).json({
        success: false,
        message: "La paginación no es válida",
      });
      return;
    }

    const resultado = await consultarHistorialSeguridad({
      usuarioId,
      rol,
      desde,
      hasta,
      pagina,
      limite,
    });

    res.status(200).json({
      success: true,
      data: resultado,
    });
  } catch (error) {
    console.error("Error al consultar el historial de seguridad.");
    responderError(res, error);
  }
}

// ------------------------------------------------------
// PREVISUALIZAR CANTIDAD DE REGISTROS A ELIMINAR
// ------------------------------------------------------

export async function contarHistorialController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { rol } = obtenerUsuarioAutenticado(req);

    const desde =
      typeof req.query.desde === "string" ? req.query.desde : undefined;

    const hasta =
      typeof req.query.hasta === "string" ? req.query.hasta : undefined;

    const cantidad = await contarHistorialParaEliminar(rol, desde, hasta);

    res.status(200).json({
      success: true,
      data: {
        cantidad,
        alcance: desde && hasta ? "RANGO_FECHAS" : "TODO_EL_HISTORIAL",
      },
    });
  } catch (error) {
    console.error("Error al contar registros de seguridad.");
    responderError(res, error);
  }
}

// ------------------------------------------------------
// ELIMINAR HISTORIAL POR RANGO DE FECHAS
// ------------------------------------------------------

export async function eliminarHistorialController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { rol } = obtenerUsuarioAutenticado(req);

    const { desde, hasta, confirmar } = req.body ?? {};

    if (confirmar !== true) {
      res.status(400).json({
        success: false,
        code: "CONFIRMATION_REQUIRED",
        message: "Debés confirmar la eliminación del historial",
      });
      return;
    }

    if (typeof desde !== "string" || typeof hasta !== "string") {
      res.status(400).json({
        success: false,
        message: "Debés indicar las fechas desde y hasta",
      });
      return;
    }

    const resultado = await eliminarHistorialPorRango(rol, desde, hasta);

    res.status(200).json({
      success: true,
      message: "Historial eliminado correctamente",
      data: resultado,
    });
  } catch (error) {
    console.error("Error al eliminar historial por rango.");
    responderError(res, error);
  }
}

// ------------------------------------------------------
// ELIMINAR TODO EL HISTORIAL
// ------------------------------------------------------

export async function eliminarTodoHistorialController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { rol } = obtenerUsuarioAutenticado(req);

    const { confirmar } = req.body ?? {};

    if (confirmar !== true) {
      res.status(400).json({
        success: false,
        code: "CONFIRMATION_REQUIRED",
        message:
          "Debés confirmar expresamente la eliminación de todo el historial",
      });
      return;
    }

    const resultado = await eliminarTodoElHistorial(rol);

    res.status(200).json({
      success: true,
      message: "Todo el historial fue eliminado correctamente",
      data: resultado,
    });
  } catch (error) {
    console.error("Error al eliminar todo el historial.");
    responderError(res, error);
  }
}
