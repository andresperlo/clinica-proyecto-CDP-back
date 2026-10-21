import type { Request, Response } from "express";
import { login } from "../services/auth.service.js";

export async function loginController(req: Request, res: Response) {
  const { email, password } = req.body ?? {};

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    res.status(400).json({
      success: false,
      message: "Email y contraseña son obligatorios",
    });
    return;
  }

  try {
    const resultado = await login({ email, password });

    res.status(200).json({
      success: true,
      message: "Inicio de sesión correcto",
      data: resultado,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Credenciales inválidas") {
      res.status(401).json({
        success: false,
        message: "Email o contraseña incorrectos",
      });
      return;
    }

    console.error("Error en el inicio de sesión:", error);

    res.status(500).json({
      success: false,
      message: "Error interno al iniciar sesión",
    });
  }
}
