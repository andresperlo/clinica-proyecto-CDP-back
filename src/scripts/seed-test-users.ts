import "dotenv/config";
import argon2 from "argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta configurar DATABASE_URL en el archivo .env");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const usuarios = [
    {
      nombre: "Paciente",
      apellido: "Prueba",
      email: "paciente.prueba@cdp.local",
      password: process.env.SEED_PATIENT_PASSWORD,
      rol: "PACIENTE" as const,
    },
    {
      nombre: "Profesor",
      apellido: "Prueba",
      email: "profesor.prueba@cdp.local",
      password: process.env.SEED_PROFESSOR_PASSWORD,
      rol: "PROFESOR_GIMNASIO" as const,
    },
    {
      nombre: "Medico",
      apellido: "Prueba",
      email: "medico.prueba@cdp.local",
      password: process.env.SEED_DOCTOR_PASSWORD,
      rol: "MEDICO" as const,
    },
    {
      nombre: "Administrador",
      apellido: "Prueba",
      email: "admin.prueba@cdp.local",
      password: process.env.SEED_ADMIN_PASSWORD,
      rol: "ADMIN" as const,
    },
    {
      nombre: "Secretaria",
      apellido: "Prueba",
      email: "secretaria.prueba@cdp.local",
      password: process.env.SEED_SECRETARY_PASSWORD,
      rol: "SECRETARIA" as const,
    },
  ];

  for (const usuario of usuarios) {
    if (!usuario.password) {
      throw new Error(
        `Falta configurar la contraseña de ${usuario.email} en .env`,
      );
    }

    const passwordHash = await argon2.hash(usuario.password);

    const guardado = await prisma.usuario.upsert({
      where: { email: usuario.email },
      update: {
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        passwordHash,
        rol: usuario.rol,
        estado: "ACTIVO",
      },
      create: {
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        email: usuario.email,
        passwordHash,
        rol: usuario.rol,
      },
    });

    if (usuario.rol === "MEDICO") {
      await prisma.profesional.upsert({
        where: { usuarioId: guardado.id },
        update: { tipo: "MEDICO", activo: true },
        create: {
          usuarioId: guardado.id,
          tipo: "MEDICO",
        },
      });
    }

    if (usuario.rol === "PROFESOR_GIMNASIO") {
      await prisma.profesional.upsert({
        where: { usuarioId: guardado.id },
        update: { tipo: "PROFESOR_GIMNASIO", activo: true },
        create: {
          usuarioId: guardado.id,
          tipo: "PROFESOR_GIMNASIO",
        },
      });
    }

    console.log(`Usuario preparado: ${guardado.email} (${guardado.rol})`);
  }
}

main()
  .catch((error) => {
    console.error("Error al crear los usuarios de prueba:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
