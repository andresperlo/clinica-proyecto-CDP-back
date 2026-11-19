import { Router } from "express";

import { verificarToken } from "../middlewares/auth.middleware.js";

import {
  crearControlPesoController,
  obtenerControlesPesoController,
  obtenerEvolucionPesoController,
  obtenerControlPesoPorIdController,
} from "../controllers/controlPeso.controller.js";

const router = Router();

// Todas las rutas de controles de peso requieren autenticación.
router.use(verificarToken);

// Registrar un nuevo control de peso.
router.post("/", crearControlPesoController);

// Obtener la evolución completa del peso.
// IMPORTANTE: debe estar antes de /:id.
router.get("/evolucion", obtenerEvolucionPesoController);

// Obtener todos los controles de peso.
router.get("/", obtenerControlesPesoController);

// Obtener un control específico.
router.get("/:id", obtenerControlPesoPorIdController);

export default router;
