import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === "REEMPLAZAR_POR_UN_SECRETO_ALEATORIO") {
    throw new Error("JWT_SECRET no está configurado correctamente en .env");
  }

  return secret;
}

const JWT_SECRET = getJwtSecret();

export interface LoginInput {
  email: string;
  password: string;
}

export async function login(input: LoginInput) {
  const email = input.email.trim().toLowerCase();

  const usuario = await prisma.usuario.findUnique({
    where: { email },
  });

  if (
    !usuario ||
    usuario.estado !== "ACTIVO" ||
    !(await argon2.verify(usuario.passwordHash, input.password))
  ) {
    throw new Error("Credenciales inválidas");
  }

  const token = jwt.sign(
    {
      sub: usuario.id,
      rol: usuario.rol,
    },
    JWT_SECRET,
    { expiresIn: "8h" },
  );

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rol: usuario.rol,
    },
  };
}
