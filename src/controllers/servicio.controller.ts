import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";

import {
  obtenerServicios,
  obtenerAccesosServiciosPaciente,
  habilitarServicioPaciente,
  deshabilitarServicioPaciente,
} from "../services/servicio.service.js";

/**
 * GET /servicios
 *
 * Obtiene todos los servicios activos.
 *
 * Pueden consultar:
 * - ADMIN
 * - SECRETARIA
 * - MEDICO
 * - PROFESIONAL
 * - PROFESOR_GIMNASIO
 * - PACIENTE
 */
export const obtenerServiciosController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: "No autenticado.",
      });
    }

    const servicios = await obtenerServicios();

    return res.status(200).json({
      servicios,
    });
  } catch (error) {
    console.error("Error al obtener los servicios:", error);

    return res.status(500).json({
      mensaje: "Error al obtener los servicios.",
    });
  }
};

/**
 * GET /servicios/paciente/:pacienteId
 *
 * Obtiene los servicios habilitados para un paciente.
 *
 * ADMIN y SECRETARIA:
 * - Pueden consultar cualquier paciente.
 *
 * PACIENTE:
 * - Solo puede consultar sus propios servicios.
 */
export const obtenerServiciosPacienteController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: "No autenticado.",
      });
    }

    const { pacienteId } = req.params;

    if (Array.isArray(pacienteId) || !pacienteId) {
      return res.status(400).json({
        mensaje: "El pacienteId es obligatorio.",
      });
    }

    const rolesAdministrativos = ["ADMIN", "SECRETARIA"];

    if (req.usuario.rol === "PACIENTE" && req.usuario.id !== pacienteId) {
      return res.status(403).json({
        mensaje:
          "No tenés permisos para consultar los servicios de este paciente.",
      });
    }

    if (
      !rolesAdministrativos.includes(req.usuario.rol) &&
      req.usuario.rol !== "PACIENTE"
    ) {
      return res.status(403).json({
        mensaje: "No tenés permisos para consultar los servicios del paciente.",
      });
    }

    const accesos = await obtenerAccesosServiciosPaciente(pacienteId);

    return res.status(200).json({
      servicios: accesos,
    });
  } catch (error) {
    console.error("Error al obtener los servicios del paciente:", error);

    return res.status(500).json({
      mensaje: "Error al obtener los servicios del paciente.",
    });
  }
};

/**
 * POST /servicios/paciente/:pacienteId
 *
 * Habilita un servicio para un paciente.
 *
 * SOLO:
 * - ADMIN
 * - SECRETARIA
 */
export const habilitarServicioPacienteController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: "No autenticado.",
      });
    }

    const rolesPermitidos = ["ADMIN", "SECRETARIA"];

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        mensaje: "No tenés permisos para habilitar servicios a pacientes.",
      });
    }

    const { pacienteId } = req.params;
    const { servicioId } = req.body;

    if (Array.isArray(pacienteId) || !pacienteId) {
      return res.status(400).json({
        mensaje: "El pacienteId es obligatorio.",
      });
    }

    if (!servicioId || typeof servicioId !== "string") {
      return res.status(400).json({
        mensaje: "El servicioId es obligatorio.",
      });
    }

    const acceso = await habilitarServicioPaciente(
      pacienteId,
      servicioId,
      req.usuario.id,
    );

    return res.status(200).json({
      mensaje: "Servicio habilitado correctamente para el paciente.",
      acceso,
    });
  } catch (error) {
    console.error("Error al habilitar servicio para el paciente:", error);

    const mensaje =
      error instanceof Error
        ? error.message
        : "Error al habilitar el servicio para el paciente.";

    return res.status(400).json({
      mensaje,
    });
  }
};

/**
 * PATCH /servicios/paciente/:pacienteId/:servicioId
 *
 * Deshabilita un servicio para un paciente.
 *
 * Es una BAJA LÓGICA:
 * - No elimina el registro.
 * - Cambia habilitado a false.
 *
 * SOLO:
 * - ADMIN
 * - SECRETARIA
 */
export const deshabilitarServicioPacienteController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: "No autenticado.",
      });
    }

    const rolesPermitidos = ["ADMIN", "SECRETARIA"];

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        mensaje: "No tenés permisos para deshabilitar servicios a pacientes.",
      });
    }

    const { pacienteId, servicioId } = req.params;

    if (Array.isArray(pacienteId) || !pacienteId) {
      return res.status(400).json({
        mensaje: "El pacienteId es obligatorio.",
      });
    }

    if (Array.isArray(servicioId) || !servicioId) {
      return res.status(400).json({
        mensaje: "El servicioId es obligatorio.",
      });
    }

    const acceso = await deshabilitarServicioPaciente(pacienteId, servicioId);

    return res.status(200).json({
      mensaje: "Servicio deshabilitado correctamente para el paciente.",
      acceso,
    });
  } catch (error) {
    console.error("Error al deshabilitar servicio para el paciente:", error);

    const mensaje =
      error instanceof Error
        ? error.message
        : "Error al deshabilitar el servicio para el paciente.";

    return res.status(400).json({
      mensaje,
    });
  }
};
