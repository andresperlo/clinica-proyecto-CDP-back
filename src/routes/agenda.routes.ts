import { Router } from "express";

import {
  obtenerHorariosController,
  obtenerHorarioPorDiaController,
  crearHorarioController,
  actualizarHorarioController,
  obtenerExcepcionesController,
  obtenerExcepcionPorFechaController,
  crearExcepcionController,
  actualizarExcepcionController,
  eliminarExcepcionController,
} from "../controllers/agenda.controller.js";

import { verificarToken } from "../middlewares/auth.middleware.js";

const router = Router();

// ------------------------------------------------------
// HORARIOS SEMANALES
// ------------------------------------------------------

router.get("/horarios", verificarToken, obtenerHorariosController);

router.get(
  "/horarios/:diaSemana",
  verificarToken,
  obtenerHorarioPorDiaController,
);

router.post("/horarios", verificarToken, crearHorarioController);

router.patch("/horarios/:id", verificarToken, actualizarHorarioController);

// ------------------------------------------------------
// EXCEPCIONES
// ------------------------------------------------------

router.get("/excepciones", verificarToken, obtenerExcepcionesController);

router.get(
  "/excepciones/fecha/:fecha",
  verificarToken,
  obtenerExcepcionPorFechaController,
);

router.post("/excepciones", verificarToken, crearExcepcionController);

router.patch("/excepciones/:id", verificarToken, actualizarExcepcionController);

router.delete("/excepciones/:id", verificarToken, eliminarExcepcionController);

export default router;
