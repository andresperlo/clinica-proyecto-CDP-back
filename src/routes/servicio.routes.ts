import { Router } from "express";

import {
  obtenerServiciosController,
  obtenerServiciosPacienteController,
  habilitarServicioPacienteController,
  deshabilitarServicioPacienteController,
} from "../controllers/servicio.controller.js";

import { verificarToken } from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * GET /servicios
 *
 * Obtiene todos los servicios activos.
 */
router.get("/", verificarToken, obtenerServiciosController);

/**
 * GET /servicios/paciente/:pacienteId
 *
 * Obtiene los servicios habilitados para un paciente.
 */
router.get(
  "/paciente/:pacienteId",
  verificarToken,
  obtenerServiciosPacienteController,
);

/**
 * POST /servicios/paciente/:pacienteId
 *
 * Habilita un servicio para un paciente.
 *
 * Solo ADMIN y SECRETARIA pueden hacerlo.
 */
router.post(
  "/paciente/:pacienteId",
  verificarToken,
  habilitarServicioPacienteController,
);

/**
 * PATCH /servicios/paciente/:pacienteId/:servicioId
 *
 * Deshabilita un servicio para un paciente.
 *
 * Es una baja lógica.
 */
router.patch(
  "/paciente/:pacienteId/:servicioId",
  verificarToken,
  deshabilitarServicioPacienteController,
);

export default router;
