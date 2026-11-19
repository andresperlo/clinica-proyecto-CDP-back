import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta configurar DATABASE_URL en el archivo .env");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const servicios = [
    {
      nombre: "Gimnasio",
      descripcion: "Servicio de gimnasio",
      codigo: "GIMNASIO",
    },
    {
      nombre: "Nutrición",
      descripcion: "Servicio de nutrición",
      codigo: "NUTRICION",
    },
    {
      nombre: "Psicología",
      descripcion: "Servicio de psicología",
      codigo: "PSICOLOGIA",
    },
    {
      nombre: "Cardiología",
      descripcion: "Servicio de cardiología",
      codigo: "CARDIOLOGIA",
    },
  ];

  for (const servicio of servicios) {
    const guardado = await prisma.servicio.upsert({
      where: {
        codigo: servicio.codigo,
      },
      update: {
        nombre: servicio.nombre,
        descripcion: servicio.descripcion,
        activo: true,
      },
      create: servicio,
    });

    console.log(`Servicio preparado: ${guardado.nombre} (${guardado.codigo})`);
  }
}

main()
  .catch((error) => {
    console.error("Error al crear los servicios:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
