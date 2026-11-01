import { Router } from "express";

import {
  loginController,
  registerController,
  meController,
  logoutController,
  verificarCodigoController,
  solicitudesPendientesController,
  aprobarSegundoDispositivoController,
  rechazarSegundoDispositivoController,
  completarVinculacionController,
  heartbeatPrincipalController,
  consultarEstadoSolicitudController,
} from "../controllers/auth.controller.js";

import { verificarToken } from "../middlewares/auth.middleware.js";

const router = Router();

// Autenticación
router.post("/login", loginController);
router.post("/register", registerController);

// Verificación del segundo dispositivo
router.post("/verify-code", verificarCodigoController);
router.post("/complete-device-link", completarVinculacionController);

// Sesión actual
router.get("/me", verificarToken, meController);
router.post("/logout", logoutController);

// Administración de dispositivos desde el principal
router.get("/device-requests", verificarToken, solicitudesPendientesController);

router.get("/device-request-status", consultarEstadoSolicitudController);

router.post(
  "/approve-device",
  verificarToken,
  aprobarSegundoDispositivoController,
);

router.post(
  "/reject-device",
  verificarToken,
  rechazarSegundoDispositivoController,
);

// Conexión del dispositivo principal
router.post("/heartbeat", verificarToken, heartbeatPrincipalController);

export default router;
