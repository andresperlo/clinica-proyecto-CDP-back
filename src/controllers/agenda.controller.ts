import type { Response } from "express";

import type { AuthRequest } from "../middlewares/auth.middleware.js";

import {
  obtenerHorariosSemanales,
  obtenerHorarioPorDia,
  crearHorario,
  actualizarHorario,
  obtenerExcepciones,
  obtenerExcepcionPorFecha,
  crearExcepcion,
  actualizarExcepcion,
  eliminarExcepcion,
} from "../services/agenda.service.js";

import { DiaSemana, TipoExcepcionAgenda } from "../generated/prisma/enums.js";

// ------------------------------------------------------
// OBTENER HORARIOS SEMANALES
// ------------------------------------------------------

export async function obtenerHorariosController(
  _req: AuthRequest,
  res: Response,
) {
  try {
    const horarios = await obtenerHorariosSemanales();

    res.status(200).json({
      success: true,
      data: horarios,
    });
  } catch (error) {
    console.error("Error al obtener horarios de agenda:", error);

    res.status(500).json({
      success: false,
      message: "No se pudieron obtener los horarios de la clínica",
    });
  }
}

// ------------------------------------------------------
// OBTENER HORARIO POR DÍA
// ------------------------------------------------------

export async function obtenerHorarioPorDiaController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const diaSemana = req.params.diaSemana as DiaSemana;

    if (!Object.values(DiaSemana).includes(diaSemana)) {
      res.status(400).json({
        success: false,
        message: "Día de la semana inválido",
      });
      return;
    }

    const horario = await obtenerHorarioPorDia(diaSemana);

    if (!horario) {
      res.status(404).json({
        success: false,
        message: "No existe un horario configurado para ese día",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: horario,
    });
  } catch (error) {
    console.error("Error al obtener horario:", error);

    res.status(500).json({
      success: false,
      message: "No se pudo obtener el horario",
    });
  }
}

// ------------------------------------------------------
// CREAR HORARIO
// ------------------------------------------------------

export async function crearHorarioController(req: AuthRequest, res: Response) {
  try {
    const { diaSemana, horaApertura, horaCierre, habilitado } = req.body;

    if (!diaSemana || !horaApertura || !horaCierre) {
      res.status(400).json({
        success: false,
        message: "diaSemana, horaApertura y horaCierre son obligatorios",
      });
      return;
    }

    if (!Object.values(DiaSemana).includes(diaSemana)) {
      res.status(400).json({
        success: false,
        message: "Día de la semana inválido",
      });
      return;
    }

    const horario = await crearHorario({
      diaSemana,
      horaApertura,
      horaCierre,
      habilitado,
    });

    res.status(201).json({
      success: true,
      message: "Horario creado correctamente",
      data: horario,
    });
  } catch (error) {
    console.error("Error al crear horario:", error);

    res.status(400).json({
      success: false,
      message:
        error instanceof Error ? error.message : "No se pudo crear el horario",
    });
  }
}

// ------------------------------------------------------
// ACTUALIZAR HORARIO
// ------------------------------------------------------

export async function actualizarHorarioController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      res.status(400).json({
        success: false,
        message: "El ID del horario no es válido",
      });
      return;
    }

    const { horaApertura, horaCierre, habilitado } = req.body;

    const horario = await actualizarHorario(id, {
      horaApertura,
      horaCierre,
      habilitado,
    });

    res.status(200).json({
      success: true,
      message: "Horario actualizado correctamente",
      data: horario,
    });
  } catch (error) {
    console.error("Error al actualizar horario:", error);

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el horario",
    });
  }
}

// ------------------------------------------------------
// OBTENER EXCEPCIONES
// ------------------------------------------------------

export async function obtenerExcepcionesController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { desde, hasta } = req.query;

    let fechaDesde: Date | undefined;
    let fechaHasta: Date | undefined;

    if (typeof desde === "string") {
      fechaDesde = new Date(`${desde}T00:00:00`);

      if (Number.isNaN(fechaDesde.getTime())) {
        res.status(400).json({
          success: false,
          message: "La fecha desde no es válida",
        });
        return;
      }
    }

    if (typeof hasta === "string") {
      fechaHasta = new Date(`${hasta}T00:00:00`);

      if (Number.isNaN(fechaHasta.getTime())) {
        res.status(400).json({
          success: false,
          message: "La fecha hasta no es válida",
        });
        return;
      }
    }

    const excepciones = await obtenerExcepciones(fechaDesde, fechaHasta);

    res.status(200).json({
      success: true,
      data: excepciones,
    });
  } catch (error) {
    console.error("Error al obtener excepciones:", error);

    res.status(500).json({
      success: false,
      message: "No se pudieron obtener las excepciones de agenda",
    });
  }
}

// ------------------------------------------------------
// OBTENER EXCEPCIÓN POR FECHA
// ------------------------------------------------------

export async function obtenerExcepcionPorFechaController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { fecha } = req.params;

    const fechaConsulta = new Date(`${fecha}T00:00:00`);

    if (Number.isNaN(fechaConsulta.getTime())) {
      res.status(400).json({
        success: false,
        message: "La fecha no es válida",
      });
      return;
    }

    const excepcion = await obtenerExcepcionPorFecha(fechaConsulta);

    if (!excepcion) {
      res.status(404).json({
        success: false,
        message: "No existe una excepción para esa fecha",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: excepcion,
    });
  } catch (error) {
    console.error("Error al obtener excepción:", error);

    res.status(500).json({
      success: false,
      message: "No se pudo obtener la excepción",
    });
  }
}

// ------------------------------------------------------
// CREAR EXCEPCIÓN
// ------------------------------------------------------

export async function crearExcepcionController(
  req: AuthRequest,
  res: Response,
) {
  try {
    if (!req.usuario) {
      res.status(401).json({
        success: false,
        message: "No hay una sesión activa",
      });
      return;
    }

    const { fecha, tipo, horaApertura, horaCierre, motivo } = req.body;

    if (!fecha || !tipo || !motivo) {
      res.status(400).json({
        success: false,
        message: "fecha, tipo y motivo son obligatorios",
      });
      return;
    }

    if (!Object.values(TipoExcepcionAgenda).includes(tipo)) {
      res.status(400).json({
        success: false,
        message: "Tipo de excepción inválido",
      });
      return;
    }

    const excepcion = await crearExcepcion(
      {
        fecha,
        tipo,
        horaApertura,
        horaCierre,
        motivo,
      },
      req.usuario.id,
    );

    res.status(201).json({
      success: true,
      message: "Excepción creada correctamente",
      data: excepcion,
    });
  } catch (error) {
    console.error("Error al crear excepción:", error);

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo crear la excepción",
    });
  }
}

// ------------------------------------------------------
// ACTUALIZAR EXCEPCIÓN
// ------------------------------------------------------

export async function actualizarExcepcionController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { id } = req.params;

    const { tipo, horaApertura, horaCierre, motivo } = req.body;

    if (typeof id !== "string") {
      res.status(400).json({
        success: false,
        message: "El ID del horario no es válido",
      });
      return;
    }

    if (
      tipo !== undefined &&
      !Object.values(TipoExcepcionAgenda).includes(tipo)
    ) {
      res.status(400).json({
        success: false,
        message: "Tipo de excepción inválido",
      });
      return;
    }

    const excepcion = await actualizarExcepcion(id, {
      tipo,
      horaApertura,
      horaCierre,
      motivo,
    });

    res.status(200).json({
      success: true,
      message: "Excepción actualizada correctamente",
      data: excepcion,
    });
  } catch (error) {
    console.error("Error al actualizar excepción:", error);

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la excepción",
    });
  }
}

// ------------------------------------------------------
// ELIMINAR EXCEPCIÓN
// ------------------------------------------------------

export async function eliminarExcepcionController(
  req: AuthRequest,
  res: Response,
) {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      res.status(400).json({
        success: false,
        message: "El ID del horario no es válido",
      });
      return;
    }

    const resultado = await eliminarExcepcion(id);

    res.status(200).json({
      success: true,
      ...resultado,
    });
  } catch (error) {
    console.error("Error al eliminar excepción:", error);

    res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la excepción",
    });
  }
}
