import { Router } from "express";

import { verificarToken } from "../middlewares/auth.middleware.js";

import {
  consultarHistorialController,
  contarHistorialController,
  eliminarHistorialController,
  eliminarTodoHistorialController,
} from "../controllers/seguridad.controller.js";

const router = Router();

// Todas las rutas requieren autenticación.
router.use(verificarToken);

// Consultar historial de seguridad.
router.get("/historial", consultarHistorialController);

// Contar registros antes de eliminarlos.
router.get("/historial/contar", contarHistorialController);

// Eliminar historial por rango de fechas.
router.delete("/historial", eliminarHistorialController);

// Eliminar todo el historial.
router.delete("/historial/todo", eliminarTodoHistorialController);

export default router;
