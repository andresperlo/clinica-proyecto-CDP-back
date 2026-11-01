import rateLimit from "express-rate-limit";

// Protección para el inicio de sesión.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    message:
      "Demasiados intentos de inicio de sesión. Intentá nuevamente en 15 minutos.",
  },
});

// Protección para el registro de usuarios.
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    message:
      "Demasiados intentos de registro. Intentá nuevamente dentro de una hora.",
  },
});

// Protección para verificar el código enviado por email.
export const verifyCodeRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    message:
      "Demasiados intentos de verificación. Esperá unos minutos antes de volver a intentar.",
  },
});

// Protección para consultar el estado de una solicitud.
export const deviceRequestStatusRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    message:
      "Demasiadas consultas del estado de la solicitud. Intentá nuevamente en un minuto.",
  },
});

// Protección para completar la vinculación del dispositivo.
export const completeDeviceLinkRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    message:
      "Demasiados intentos de vinculación. Esperá unos minutos antes de volver a intentar.",
  },
});

// Protección para cancelar solicitudes de dispositivos.
export const cancelDeviceRequestRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    ok: false,
    message:
      "Demasiados intentos de cancelación. Esperá unos minutos antes de volver a intentar.",
  },
});
