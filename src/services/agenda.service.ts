import { prisma } from "../lib/prisma.js";
import { DiaSemana, TipoExcepcionAgenda } from "../generated/prisma/client.js";

interface CrearHorarioInput {
  diaSemana: DiaSemana;
  horaApertura: string;
  horaCierre: string;
  habilitado?: boolean;
}

interface ActualizarHorarioInput {
  horaApertura?: string;
  horaCierre?: string;
  habilitado?: boolean;
}

interface CrearExcepcionInput {
  fecha: string;
  tipo: TipoExcepcionAgenda;
  horaApertura?: string;
  horaCierre?: string;
  motivo: string;
}

interface ActualizarExcepcionInput {
  tipo?: TipoExcepcionAgenda;
  horaApertura?: string;
  horaCierre?: string;
  motivo?: string;
}

/**
 * Convierte una hora "HH:mm" en un Date.
 *
 * PostgreSQL utiliza el campo DateTime @db.Time(0),
 * por eso Prisma espera un objeto Date.
 */
function convertirHoraAFecha(hora: string): Date {
  const partes = hora.split(":");

  const horas = Number(partes[0]);
  const minutos = Number(partes[1]);

  if (
    Number.isNaN(horas) ||
    Number.isNaN(minutos) ||
    horas < 0 ||
    horas > 23 ||
    minutos < 0 ||
    minutos > 59
  ) {
    throw new Error("La hora debe tener el formato HH:mm");
  }

  const fecha = new Date(1970, 0, 1, horas, minutos, 0, 0);

  return fecha;
}

/**
 * Valida que la hora de apertura sea anterior
 * a la hora de cierre.
 */
function validarRangoHorario(horaApertura: string, horaCierre: string): void {
  const apertura = convertirHoraAFecha(horaApertura);
  const cierre = convertirHoraAFecha(horaCierre);

  if (apertura >= cierre) {
    throw new Error(
      "La hora de apertura debe ser anterior a la hora de cierre",
    );
  }
}

/**
 * Convierte un Date de Prisma a "HH:mm".
 */
function formatearHora(fecha: Date | null): string | null {
  if (!fecha) {
    return null;
  }

  const horas = String(fecha.getUTCHours()).padStart(2, "0");
  const minutos = String(fecha.getUTCMinutes()).padStart(2, "0");

  return `${horas}:${minutos}`;
}
/**
 * Obtiene todos los horarios semanales.
 */
export async function obtenerHorariosSemanales() {
  const horarios = await prisma.horarioClinica.findMany({
    orderBy: {
      diaSemana: "asc",
    },
  });

  return horarios.map((horario) => ({
    ...horario,
    horaApertura: formatearHora(horario.horaApertura),
    horaCierre: formatearHora(horario.horaCierre),
  }));
}

/**
 * Obtiene el horario correspondiente a un día de la semana.
 */
export async function obtenerHorarioPorDia(diaSemana: DiaSemana) {
  const horario = await prisma.horarioClinica.findUnique({
    where: {
      diaSemana,
    },
  });

  if (!horario) {
    return null;
  }

  return {
    ...horario,
    horaApertura: formatearHora(horario.horaApertura),
    horaCierre: formatearHora(horario.horaCierre),
  };
}

/**
 * Crea un horario semanal.
 */
export async function crearHorario(data: CrearHorarioInput) {
  validarRangoHorario(data.horaApertura, data.horaCierre);

  const horarioExistente = await prisma.horarioClinica.findUnique({
    where: {
      diaSemana: data.diaSemana,
    },
  });

  if (horarioExistente) {
    throw new Error("Ya existe un horario configurado para ese día");
  }

  const horario = await prisma.horarioClinica.create({
    data: {
      diaSemana: data.diaSemana,
      horaApertura: convertirHoraAFecha(data.horaApertura),
      horaCierre: convertirHoraAFecha(data.horaCierre),
      habilitado: data.habilitado ?? true,
    },
  });

  return {
    ...horario,
    horaApertura: formatearHora(horario.horaApertura),
    horaCierre: formatearHora(horario.horaCierre),
  };
}

/**
 * Actualiza un horario semanal.
 */
export async function actualizarHorario(
  id: string,
  data: ActualizarHorarioInput,
) {
  const horarioExistente = await prisma.horarioClinica.findUnique({
    where: {
      id,
    },
  });

  if (!horarioExistente) {
    throw new Error("No se encontró el horario");
  }

  const horaApertura =
    data.horaApertura ?? formatearHora(horarioExistente.horaApertura);

  const horaCierre =
    data.horaCierre ?? formatearHora(horarioExistente.horaCierre);

  if (data.habilitado !== false) {
    if (!horaApertura || !horaCierre) {
      throw new Error("Un día habilitado requiere hora de apertura y cierre");
    }

    validarRangoHorario(horaApertura, horaCierre);
  }

  const horario = await prisma.horarioClinica.update({
    where: {
      id,
    },
    data: {
      ...(data.horaApertura !== undefined && {
        horaApertura: convertirHoraAFecha(data.horaApertura),
      }),
      ...(data.horaCierre !== undefined && {
        horaCierre: convertirHoraAFecha(data.horaCierre),
      }),
      ...(data.habilitado !== undefined && {
        habilitado: data.habilitado,
      }),
    },
  });

  return {
    ...horario,
    horaApertura: formatearHora(horario.horaApertura),
    horaCierre: formatearHora(horario.horaCierre),
  };
}

/**
 * Obtiene todas las excepciones de agenda.
 */
export async function obtenerExcepciones(desde?: Date, hasta?: Date) {
  const excepciones = await prisma.excepcionAgenda.findMany({
    where: {
      ...(desde || hasta
        ? {
            fecha: {
              ...(desde && {
                gte: desde,
              }),
              ...(hasta && {
                lte: hasta,
              }),
            },
          }
        : {}),
    },
    orderBy: {
      fecha: "asc",
    },
  });

  return excepciones.map((excepcion) => ({
    ...excepcion,
    horaApertura: excepcion.horaApertura
      ? formatearHora(excepcion.horaApertura)
      : null,
    horaCierre: excepcion.horaCierre
      ? formatearHora(excepcion.horaCierre)
      : null,
  }));
}

/**
 * Obtiene una excepción por fecha.
 */
export async function obtenerExcepcionPorFecha(fecha: Date) {
  const excepcion = await prisma.excepcionAgenda.findUnique({
    where: {
      fecha,
    },
  });

  if (!excepcion) {
    return null;
  }

  return {
    ...excepcion,
    horaApertura: excepcion.horaApertura
      ? formatearHora(excepcion.horaApertura)
      : null,
    horaCierre: excepcion.horaCierre
      ? formatearHora(excepcion.horaCierre)
      : null,
  };
}

/**
 * Crea una excepción de agenda.
 *
 * CERRADO:
 * no necesita horario.
 *
 * HORARIO_ESPECIAL:
 * necesita hora de apertura y cierre.
 */
export async function crearExcepcion(
  data: CrearExcepcionInput,
  creadoPorId: string,
) {
  const fecha = new Date(`${data.fecha}T00:00:00`);

  if (Number.isNaN(fecha.getTime())) {
    throw new Error("La fecha no es válida");
  }

  if (data.tipo === TipoExcepcionAgenda.CERRADO) {
    if (data.horaApertura || data.horaCierre) {
      throw new Error("Una excepción de tipo CERRADO no debe tener horarios");
    }
  }

  if (data.tipo === TipoExcepcionAgenda.HORARIO_ESPECIAL) {
    if (!data.horaApertura || !data.horaCierre) {
      throw new Error("Un horario especial requiere hora de apertura y cierre");
    }

    validarRangoHorario(data.horaApertura, data.horaCierre);
  }

  const existente = await prisma.excepcionAgenda.findUnique({
    where: {
      fecha,
    },
  });

  if (existente) {
    throw new Error("Ya existe una excepción para esa fecha");
  }

  const excepcion = await prisma.excepcionAgenda.create({
    data: {
      fecha,
      tipo: data.tipo,
      horaApertura: data.horaApertura
        ? convertirHoraAFecha(data.horaApertura)
        : null,
      horaCierre: data.horaCierre ? convertirHoraAFecha(data.horaCierre) : null,
      motivo: data.motivo,
      creadoPorId,
    },
  });

  return {
    ...excepcion,
    horaApertura: excepcion.horaApertura
      ? formatearHora(excepcion.horaApertura)
      : null,
    horaCierre: excepcion.horaCierre
      ? formatearHora(excepcion.horaCierre)
      : null,
  };
}

/**
 * Actualiza una excepción.
 */
export async function actualizarExcepcion(
  id: string,
  data: ActualizarExcepcionInput,
) {
  const existente = await prisma.excepcionAgenda.findUnique({
    where: {
      id,
    },
  });

  if (!existente) {
    throw new Error("No se encontró la excepción");
  }

  const tipo = data.tipo ?? existente.tipo;

  const horaApertura =
    data.horaApertura ??
    (existente.horaApertura
      ? formatearHora(existente.horaApertura)
      : undefined);

  const horaCierre =
    data.horaCierre ??
    (existente.horaCierre ? formatearHora(existente.horaCierre) : undefined);

  if (tipo === TipoExcepcionAgenda.CERRADO) {
    if (data.horaApertura || data.horaCierre) {
      throw new Error("Una excepción de tipo CERRADO no debe tener horarios");
    }
  }

  if (tipo === TipoExcepcionAgenda.HORARIO_ESPECIAL) {
    if (!horaApertura || !horaCierre) {
      throw new Error("Un horario especial requiere hora de apertura y cierre");
    }

    validarRangoHorario(horaApertura, horaCierre);
  }

  const excepcion = await prisma.excepcionAgenda.update({
    where: {
      id,
    },
    data: {
      tipo,

      horaApertura:
        tipo === TipoExcepcionAgenda.CERRADO
          ? null
          : horaApertura
            ? convertirHoraAFecha(horaApertura)
            : null,

      horaCierre:
        tipo === TipoExcepcionAgenda.CERRADO
          ? null
          : horaCierre
            ? convertirHoraAFecha(horaCierre)
            : null,

      ...(data.motivo !== undefined && {
        motivo: data.motivo,
      }),
    },
  });

  return {
    ...excepcion,
    horaApertura: excepcion.horaApertura
      ? formatearHora(excepcion.horaApertura)
      : null,
    horaCierre: excepcion.horaCierre
      ? formatearHora(excepcion.horaCierre)
      : null,
  };
}

/**
 * Elimina una excepción de agenda.
 */
export async function eliminarExcepcion(id: string) {
  const existente = await prisma.excepcionAgenda.findUnique({
    where: {
      id,
    },
  });

  if (!existente) {
    throw new Error("No se encontró la excepción");
  }

  await prisma.excepcionAgenda.delete({
    where: {
      id,
    },
  });

  return {
    mensaje: "Excepción eliminada correctamente",
  };
}
