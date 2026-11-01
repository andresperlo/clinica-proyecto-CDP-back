import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import apiRoutes from "./routes/index.js";

const app = express();
app.set("trust proxy", 1);

const FRONTEND_URL = process.env.FRONTEND_URL;

if (!FRONTEND_URL) {
  throw new Error("FRONTEND_URL no está configurada en el entorno");
}

app.use(helmet());

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

app.use(cookieParser());
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "API de la clínica funcionando correctamente",
    environment: process.env.NODE_ENV || "development",
  });
});

app.use("/api", apiRoutes);

export default app;
