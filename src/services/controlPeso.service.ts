import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";

interface CrearControlPesoData {
  pacienteId: string;
  profesionalId: string;
  pesoKg: number;
  alturaMetros?: number;
  fechaControl?: Date;
  observaciones?: string;
}

/**
 * Registra un nuevo control de peso.
 *
 * Cada control se guarda como un registro histórico independiente.
 * No se modifica el control anterior.
 */
export const crearControlPeso = async ({
  pacienteId,
  profesionalId,
  pesoKg,
  alturaMetros,
  fechaControl,
  observaciones,
}: CrearControlPesoData) => {
  if (pesoKg <= 0) {
    throw new Error("El peso debe ser mayor a 0.");
  }

  if (alturaMetros !== undefined && alturaMetros <= 0) {
    throw new Error("La altura debe ser mayor a 0.");
  }

  const paciente = await prisma.usuario.findUnique({
    where: {
      id: pacienteId,
    },
    select: {
      id: true,
      rol: true,
      estado: true,
    },
  });

  if (!paciente) {
    throw new Error("El paciente no existe.");
  }

  if (paciente.rol !== "PACIENTE") {
    throw new Error("El usuario indicado no es un paciente.");
  }

  if (paciente.estado !== "ACTIVO") {
    throw new Error("El paciente no está activo.");
  }

  const profesional = await prisma.usuario.findUnique({
    where: {
      id: profesionalId,
    },
    select: {
      id: true,
      rol: true,
      estado: true,
    },
  });

  if (!profesional) {
    throw new Error("El profesional no existe.");
  }

  const rolesProfesionalesPermitidos = ["MEDICO", "PROFESIONAL"] as const;

  if (
    !rolesProfesionalesPermitidos.includes(
      profesional.rol as (typeof rolesProfesionalesPermitidos)[number],
    )
  ) {
    throw new Error(
      "El usuario no tiene permisos para registrar controles de peso.",
    );
  }

  if (profesional.estado !== "ACTIVO") {
    throw new Error("El profesional no está activo.");
  }

  const control = await prisma.controlPeso.create({
    data: {
      pacienteId,
      profesionalId,
      pesoKg: new Prisma.Decimal(pesoKg),
      ...(alturaMetros !== undefined && {
        alturaMetros: new Prisma.Decimal(alturaMetros),
      }),
      fechaControl: fechaControl ?? new Date(),
      observaciones: observaciones?.trim() || null,
    },
  });

  return control;
};

/**
 * Obtiene todos los controles de peso de un paciente.
 *
 * Se devuelven del más antiguo al más reciente para facilitar
 * la construcción de la evolución y del gráfico.
 */
export const obtenerControlesPesoPaciente = async (pacienteId: string) => {
  const controles = await prisma.controlPeso.findMany({
    where: {
      pacienteId,
    },
    orderBy: {
      fechaControl: "asc",
    },
    select: {
      id: true,
      pacienteId: true,
      profesionalId: true,
      pesoKg: true,
      alturaMetros: true,
      fechaControl: true,
      observaciones: true,
    },
  });

  return controles;
};

/**
 * Obtiene un control específico verificando que pertenezca
 * al paciente indicado.
 */
export const obtenerControlPesoPorId = async (
  controlId: string,
  pacienteId: string,
) => {
  const control = await prisma.controlPeso.findFirst({
    where: {
      id: controlId,
      pacienteId,
    },
    select: {
      id: true,
      pacienteId: true,
      profesionalId: true,
      pesoKg: true,
      alturaMetros: true,
      fechaControl: true,
      observaciones: true,
    },
  });

  if (!control) {
    throw new Error("El control de peso no existe.");
  }

  return control;
};

/**
 * Obtiene la evolución completa del peso de un paciente.
 *
 * Incluye:
 * - Peso inicial.
 * - Peso actual.
 * - Altura.
 * - IMC actual.
 * - Diferencia total de peso.
 * - Cantidad de controles.
 * - Historial completo.
 * - Evolución mensual.
 * - Evolución anual.
 * - Mejor mes.
 * - Mejor año.
 */
export const obtenerEvolucionPesoPaciente = async (pacienteId: string) => {
  const controles = await prisma.controlPeso.findMany({
    where: {
      pacienteId,
    },
    orderBy: {
      fechaControl: "asc",
    },
    select: {
      id: true,
      pesoKg: true,
      alturaMetros: true,
      fechaControl: true,
      observaciones: true,
    },
  });

  if (controles.length === 0) {
    return {
      pesoInicial: null,
      pesoActual: null,
      alturaMetros: null,
      imcActual: null,
      diferenciaKg: null,
      totalControles: 0,
      mejorMes: null,
      mejorAnio: null,
      evolucionMensual: [],
      evolucionAnual: [],
      historial: [],
    };
  }

  const primerControl = controles[0];

  if (!primerControl) {
    return {
      pesoInicial: null,
      pesoActual: null,
      alturaMetros: null,
      imcActual: null,
      diferenciaKg: null,
      totalControles: 0,
      mejorMes: null,
      mejorAnio: null,
      evolucionMensual: [],
      evolucionAnual: [],
      historial: [],
    };
  }

  const ultimoControl = controles[controles.length - 1];

  if (!ultimoControl) {
    throw new Error("No se pudo obtener el último control de peso.");
  }

  const pesoInicial = Number(primerControl.pesoKg);
  const pesoActual = Number(ultimoControl.pesoKg);

  // Buscamos la última altura registrada disponible.
  const controlConAltura = [...controles]
    .reverse()
    .find((control) => control.alturaMetros !== null);

  const alturaMetros = controlConAltura
    ? Number(controlConAltura.alturaMetros)
    : null;

  // Positivo = pérdida de peso.
  // Negativo = aumento de peso.
  const diferenciaKg = Number((pesoInicial - pesoActual).toFixed(3));

  let imcActual: number | null = null;

  if (alturaMetros && alturaMetros > 0) {
    imcActual = Number((pesoActual / (alturaMetros * alturaMetros)).toFixed(2));
  }

  /*
   * ============================================================
   * EVOLUCIÓN MENSUAL Y ANUAL
   * ============================================================
   *
   * Utilizamos la zona horaria de Argentina para determinar
   * correctamente el mes y el año de cada control.
   */
  const formatterArgentina = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const obtenerPartesFecha = (fecha: Date) => {
    const partes = formatterArgentina.formatToParts(fecha);

    const resultado: Record<string, string> = {};

    for (const parte of partes) {
      if (parte.type !== "literal") {
        resultado[parte.type] = parte.value;
      }
    }

    return {
      anio: resultado.year ?? "",
      mes: resultado.month ?? "",
      dia: resultado.day ?? "",
    };
  };

  /*
   * ------------------------------------------------------------
   * EVOLUCIÓN MENSUAL
   * ------------------------------------------------------------
   */
  const controlesPorMes = new Map<string, typeof controles>();

  for (const control of controles) {
    const fecha = obtenerPartesFecha(control.fechaControl);

    const clave = `${fecha.anio}-${fecha.mes}`;

    const controlesDelMes = controlesPorMes.get(clave) ?? [];

    controlesDelMes.push(control);

    controlesPorMes.set(clave, controlesDelMes);
  }

  const evolucionMensual = Array.from(controlesPorMes.entries()).map(
    ([clave, controlesDelMes]) => {
      const primerControlMes = controlesDelMes[0];
      const ultimoControlMes = controlesDelMes[controlesDelMes.length - 1];

      if (!primerControlMes || !ultimoControlMes) {
        throw new Error("No se pudo construir la evolución mensual.");
      }

      const pesoInicialMes = Number(primerControlMes.pesoKg);
      const pesoFinalMes = Number(ultimoControlMes.pesoKg);

      const diferenciaKgMes = Number(
        (pesoInicialMes - pesoFinalMes).toFixed(3),
      );

      const [anio, mes] = clave.split("-");

      return {
        periodo: clave,
        anio: Number(anio),
        mes: Number(mes),
        controles: controlesDelMes.length,
        pesoInicial: pesoInicialMes,
        pesoFinal: pesoFinalMes,
        diferenciaKg: diferenciaKgMes,
      };
    },
  );

  /*
   * ------------------------------------------------------------
   * EVOLUCIÓN ANUAL
   * ------------------------------------------------------------
   */
  const controlesPorAnio = new Map<string, typeof controles>();

  for (const control of controles) {
    const fecha = obtenerPartesFecha(control.fechaControl);

    const clave = fecha.anio;

    const controlesDelAnio = controlesPorAnio.get(clave) ?? [];

    controlesDelAnio.push(control);

    controlesPorAnio.set(clave, controlesDelAnio);
  }

  const evolucionAnual = Array.from(controlesPorAnio.entries()).map(
    ([anio, controlesDelAnio]) => {
      const primerControlAnio = controlesDelAnio[0];
      const ultimoControlAnio = controlesDelAnio[controlesDelAnio.length - 1];

      if (!primerControlAnio || !ultimoControlAnio) {
        throw new Error("No se pudo construir la evolución anual.");
      }

      const pesoInicialAnio = Number(primerControlAnio.pesoKg);
      const pesoFinalAnio = Number(ultimoControlAnio.pesoKg);

      const diferenciaKgAnio = Number(
        (pesoInicialAnio - pesoFinalAnio).toFixed(3),
      );

      return {
        periodo: anio,
        anio: Number(anio),
        controles: controlesDelAnio.length,
        pesoInicial: pesoInicialAnio,
        pesoFinal: pesoFinalAnio,
        diferenciaKg: diferenciaKgAnio,
      };
    },
  );

  /*
   * ------------------------------------------------------------
   * MEJOR MES
   * ------------------------------------------------------------
   *
   * El mejor mes es el que registra la mayor pérdida de peso.
   */
  const mesesConPerdida = evolucionMensual.filter(
    (mes) => mes.diferenciaKg > 0,
  );

  const mejorMes =
    mesesConPerdida.length > 0
      ? mesesConPerdida.reduce((mejor, actual) =>
          actual.diferenciaKg > mejor.diferenciaKg ? actual : mejor,
        )
      : null;

  /*
   * ------------------------------------------------------------
   * MEJOR AÑO
   * ------------------------------------------------------------
   */
  const aniosConPerdida = evolucionAnual.filter(
    (anio) => anio.diferenciaKg > 0,
  );

  const mejorAnio =
    aniosConPerdida.length > 0
      ? aniosConPerdida.reduce((mejor, actual) =>
          actual.diferenciaKg > mejor.diferenciaKg ? actual : mejor,
        )
      : null;

  /*
   * ------------------------------------------------------------
   * HISTORIAL COMPLETO
   * ------------------------------------------------------------
   */
  const historial = controles.map((control) => ({
    id: control.id,
    pesoKg: Number(control.pesoKg),
    alturaMetros:
      control.alturaMetros !== null ? Number(control.alturaMetros) : null,
    fechaControl: control.fechaControl,
    observaciones: control.observaciones,
  }));

  return {
    pesoInicial,
    pesoActual,
    alturaMetros,
    imcActual,
    diferenciaKg,
    totalControles: controles.length,

    mejorMes,
    mejorAnio,

    evolucionMensual,
    evolucionAnual,

    historial,
  };
};
