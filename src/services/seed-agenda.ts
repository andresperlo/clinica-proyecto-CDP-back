import { prisma } from "../lib/prisma.js";
import { DiaSemana } from "../generated/prisma/enums.js";

const horarios = [
  {
    diaSemana: DiaSemana.LUNES,
    horaApertura: "14:00",
    horaCierre: "19:30",
    habilitado: true,
  },
  {
    diaSemana: DiaSemana.MARTES,
    horaApertura: "14:00",
    horaCierre: "19:30",
    habilitado: true,
  },
  {
    diaSemana: DiaSemana.MIERCOLES,
    horaApertura: "14:00",
    horaCierre: "19:30",
    habilitado: true,
  },
  {
    diaSemana: DiaSemana.JUEVES,
    horaApertura: "14:00",
    horaCierre: "19:30",
    habilitado: true,
  },
  {
    diaSemana: DiaSemana.VIERNES,
    horaApertura: "14:00",
    horaCierre: "18:00",
    habilitado: true,
  },
  {
    diaSemana: DiaSemana.SABADO,
    horaApertura: null,
    horaCierre: null,
    habilitado: false,
  },
  {
    diaSemana: DiaSemana.DOMINGO,
    horaApertura: null,
    horaCierre: null,
    habilitado: false,
  },
];

function convertirHora(hora: string): Date {
  const partes = hora.split(":");

  const horas = Number(partes[0]);
  const minutos = Number(partes[1]);

  return new Date(1970, 0, 1, horas, minutos, 0, 0);
}

async function seedAgenda() {
  console.log("📅 Cargando agenda de la clínica...");

  for (const horario of horarios) {
    const datos: {
      diaSemana: DiaSemana;
      horaApertura?: Date;
      horaCierre?: Date;
      habilitado: boolean;
    } = {
      diaSemana: horario.diaSemana,
      habilitado: horario.habilitado,
    };

    if (horario.horaApertura !== null) {
      datos.horaApertura = convertirHora(horario.horaApertura);
    }

    if (horario.horaCierre !== null) {
      datos.horaCierre = convertirHora(horario.horaCierre);
    }

    await prisma.horarioClinica.upsert({
      where: {
        diaSemana: horario.diaSemana,
      },

      update: datos,

      create: datos,
    });

    console.log(`✅ ${horario.diaSemana}`);
  }

  console.log("🎉 Agenda cargada correctamente.");
}

seedAgenda()
  .catch((error) => {
    console.error("❌ Error al cargar la agenda:", error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
