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
  cancelarSolicitudController,
  completarVinculacionController,
  heartbeatPrincipalController,
  consultarEstadoSolicitudController,
} from "../controllers/auth.controller.js";

import {
  loginRateLimiter,
  verifyCodeRateLimiter,
  deviceRequestStatusRateLimiter,
  completeDeviceLinkRateLimiter,
  registerRateLimiter,
  cancelDeviceRequestRateLimiter,
} from "../middlewares/rate-limit.middleware.js";

import { verificarToken } from "../middlewares/auth.middleware.js";

const router = Router();

// Autenticación
router.post("/login", loginRateLimiter, loginController);
router.post("/register", registerRateLimiter, registerController);

// Verificación del segundo dispositivo
router.post("/verify-code", verifyCodeRateLimiter, verificarCodigoController);

router.post(
  "/complete-device-link",
  completeDeviceLinkRateLimiter,
  completarVinculacionController,
);

// Sesión actual
router.get("/me", verificarToken, meController);
router.post("/logout", logoutController);

// Administración de dispositivos desde el principal
router.get("/device-requests", verificarToken, solicitudesPendientesController);

router.post(
  "/cancel-device-request",
  cancelDeviceRequestRateLimiter,
  cancelarSolicitudController,
);

router.get(
  "/device-request-status",
  deviceRequestStatusRateLimiter,
  consultarEstadoSolicitudController,
);

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
