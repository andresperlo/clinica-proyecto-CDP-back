import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware.js";

import {
  crearControlPeso,
  obtenerControlesPesoPaciente,
  obtenerControlPesoPorId,
  obtenerEvolucionPesoPaciente,
} from "../services/controlPeso.service.js";

/**
 * POST /controles-peso
 *
 * MEDICO / PROFESIONAL:
 * Registra un nuevo control de peso para un paciente.
 */
export const crearControlPesoController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: "No autenticado.",
      });
    }

    const rolesPermitidos = ["MEDICO", "PROFESIONAL"];

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        mensaje: "No tenés permisos para registrar controles de peso.",
      });
    }

    const { pacienteId, pesoKg, alturaMetros, fechaControl, observaciones } =
      req.body;

    if (!pacienteId) {
      return res.status(400).json({
        mensaje: "El pacienteId es obligatorio.",
      });
    }

    if (pesoKg === undefined || pesoKg === null || pesoKg === "") {
      return res.status(400).json({
        mensaje: "El peso es obligatorio.",
      });
    }

    const peso = Number(pesoKg);

    if (!Number.isFinite(peso) || peso <= 0) {
      return res.status(400).json({
        mensaje: "El peso debe ser un número mayor a 0.",
      });
    }

    let altura: number | undefined;

    if (
      alturaMetros !== undefined &&
      alturaMetros !== null &&
      alturaMetros !== ""
    ) {
      altura = Number(alturaMetros);

      if (!Number.isFinite(altura) || altura <= 0) {
        return res.status(400).json({
          mensaje: "La altura debe ser un número mayor a 0.",
        });
      }
    }

    let fecha: Date | undefined;

    if (fechaControl) {
      fecha = new Date(fechaControl);

      if (Number.isNaN(fecha.getTime())) {
        return res.status(400).json({
          mensaje: "La fecha del control no es válida.",
        });
      }
    }

    const datosControl = {
      pacienteId,
      profesionalId: req.usuario.id,
      pesoKg: peso,

      ...(altura !== undefined && {
        alturaMetros: altura,
      }),

      ...(fecha !== undefined && {
        fechaControl: fecha,
      }),

      ...(observaciones !== undefined && {
        observaciones,
      }),
    };

    const control = await crearControlPeso(datosControl);

    return res.status(201).json({
      mensaje: "Control de peso registrado correctamente.",
      control,
    });
  } catch (error) {
    console.error("Error al crear control de peso:", error);

    const mensaje =
      error instanceof Error
        ? error.message
        : "Error al registrar el control de peso.";

    return res.status(400).json({
      mensaje,
    });
  }
};

/**
 * GET /controles-peso
 *
 * PACIENTE:
 * Obtiene únicamente sus propios controles.
 *
 * MEDICO / PROFESIONAL:
 * Puede consultar los controles del paciente indicado
 * mediante ?pacienteId=...
 */
export const obtenerControlesPesoController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: "No autenticado.",
      });
    }

    let pacienteId: string;

    if (req.usuario.rol === "PACIENTE") {
      pacienteId = req.usuario.id;
    } else if (
      req.usuario.rol === "MEDICO" ||
      req.usuario.rol === "PROFESIONAL"
    ) {
      const pacienteIdQuery = req.query.pacienteId;

      if (typeof pacienteIdQuery !== "string" || !pacienteIdQuery) {
        return res.status(400).json({
          mensaje: "El pacienteId es obligatorio.",
        });
      }

      pacienteId = pacienteIdQuery;
    } else {
      return res.status(403).json({
        mensaje: "No tenés permisos para consultar controles de peso.",
      });
    }

    const controles = await obtenerControlesPesoPaciente(pacienteId);

    return res.status(200).json({
      controles,
    });
  } catch (error) {
    console.error("Error al obtener controles de peso:", error);

    return res.status(500).json({
      mensaje: "Error al obtener los controles de peso.",
    });
  }
};

/**
 * GET /controles-peso/evolucion
 *
 * PACIENTE:
 * Obtiene únicamente su propia evolución.
 *
 * MEDICO / PROFESIONAL:
 * Puede consultar la evolución del paciente indicado
 * mediante ?pacienteId=...
 */
export const obtenerEvolucionPesoController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: "No autenticado.",
      });
    }

    let pacienteId: string;

    if (req.usuario.rol === "PACIENTE") {
      pacienteId = req.usuario.id;
    } else if (
      req.usuario.rol === "MEDICO" ||
      req.usuario.rol === "PROFESIONAL"
    ) {
      const pacienteIdQuery = req.query.pacienteId;

      if (typeof pacienteIdQuery !== "string" || !pacienteIdQuery) {
        return res.status(400).json({
          mensaje: "El pacienteId es obligatorio.",
        });
      }

      pacienteId = pacienteIdQuery;
    } else {
      return res.status(403).json({
        mensaje: "No tenés permisos para consultar la evolución de peso.",
      });
    }

    const evolucion = await obtenerEvolucionPesoPaciente(pacienteId);

    return res.status(200).json({
      evolucion,
    });
  } catch (error) {
    console.error("Error al obtener evolución de peso:", error);

    const mensaje =
      error instanceof Error
        ? error.message
        : "Error al obtener la evolución de peso.";

    return res.status(500).json({
      mensaje,
    });
  }
};

/**
 * GET /controles-peso/:id
 *
 * Obtiene un control específico.
 */
export const obtenerControlPesoPorIdController = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    if (!req.usuario) {
      return res.status(401).json({
        mensaje: "No autenticado.",
      });
    }

    const { id } = req.params;

    if (Array.isArray(id) || !id) {
      return res.status(400).json({
        mensaje: "El ID del control es obligatorio y debe ser válido.",
      });
    }

    let pacienteId: string;

    if (req.usuario.rol === "PACIENTE") {
      pacienteId = req.usuario.id;
    } else if (
      req.usuario.rol === "MEDICO" ||
      req.usuario.rol === "PROFESIONAL"
    ) {
      const pacienteIdQuery = req.query.pacienteId;

      if (typeof pacienteIdQuery !== "string" || !pacienteIdQuery) {
        return res.status(400).json({
          mensaje: "El pacienteId es obligatorio.",
        });
      }

      pacienteId = pacienteIdQuery;
    } else {
      return res.status(403).json({
        mensaje: "No tenés permisos para consultar este control.",
      });
    }

    const control = await obtenerControlPesoPorId(id, pacienteId);

    return res.status(200).json({
      control,
    });
  } catch (error) {
    console.error("Error al obtener control de peso:", error);

    const mensaje =
      error instanceof Error
        ? error.message
        : "Error al obtener el control de peso.";

    return res.status(404).json({
      mensaje,
    });
  }
};
