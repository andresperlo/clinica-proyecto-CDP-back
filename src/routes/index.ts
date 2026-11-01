import { Router } from "express";
import { prisma } from "../lib/prisma.js";

import authRoutes from "./auth.routes.js";
import seguridadRoutes from "./seguridad.routes.js";

const router = Router();

// Autenticación.
router.use("/auth", authRoutes);

// Seguridad e historial.
router.use("/seguridad", seguridadRoutes);

// Estado general de la API.
router.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// Comprobar conexión real con PostgreSQL.
router.get("/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      database: "connected",
      message: "Conexión con PostgreSQL correcta",
    });
  } catch (error) {
    console.error("Error de conexión con PostgreSQL:", error);

    res.status(500).json({
      success: false,
      database: "disconnected",
      message: "No se pudo conectar con la base de datos",
    });
  }
});

export default router;
