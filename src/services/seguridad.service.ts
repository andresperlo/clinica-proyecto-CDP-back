import { prisma } from "../lib/prisma.js";

// ------------------------------------------------------
// CONFIGURACIÓN
// ------------------------------------------------------

const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
const OFFSET_ARGENTINA_HORAS = 3;
const LIMITE_POR_PAGINA = 100;

// ------------------------------------------------------
// TIPOS
// ------------------------------------------------------

interface FiltrosHistorial {
  usuarioId: string;
  rol: string;
  desde?: string | undefined;
  hasta?: string | undefined;
  pagina?: number;
  limite?: number;
}

interface RangoFechas {
  desde: Date;
  hastaExclusivo: Date;
}

// ------------------------------------------------------
// FUNCIONES AUXILIARES
// ------------------------------------------------------

function verificarAdmin(rol: string): void {
  if (rol !== "ADMIN") {
    throw new Error("No tenés permisos para realizar esta operación");
  }
}

function obtenerFechaArgentina(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const obtener = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value;

  const anio = obtener("year");
  const mes = obtener("month");
  const dia = obtener("day");

  if (!anio || !mes || !dia) {
    throw new Error("No se pudo determinar la fecha actual");
  }

  return `${anio}-${mes}-${dia}`;
}

function validarFecha(fecha: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new Error("Formato de fecha inválido. Usá YYYY-MM-DD");
  }

  const partes = fecha.split("-");

  const anio = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);

  const fechaUTC = new Date(
    Date.UTC(anio, mes - 1, dia, OFFSET_ARGENTINA_HORAS),
  );

  if (
    fechaUTC.getUTCFullYear() !== anio ||
    fechaUTC.getUTCMonth() !== mes - 1 ||
    fechaUTC.getUTCDate() !== dia
  ) {
    throw new Error("La fecha ingresada no es válida");
  }

  return fechaUTC;
}

function sumarUnDia(fecha: Date): Date {
  const resultado = new Date(fecha);
  resultado.setUTCDate(resultado.getUTCDate() + 1);
  return resultado;
}

function construirRangoFechas(desde: string, hasta: string): RangoFechas {
  const fechaDesde = validarFecha(desde);
  const fechaHasta = validarFecha(hasta);

  if (desde > hasta) {
    throw new Error("La fecha desde no puede ser posterior a la fecha hasta");
  }

  return {
    desde: fechaDesde,
    hastaExclusivo: sumarUnDia(fechaHasta),
  };
}

function validarQueNoSeaFuturo(fecha: string): void {
  const hoy = obtenerFechaArgentina();

  if (fecha > hoy) {
    throw new Error("No se pueden eliminar registros de fechas futuras");
  }
}

// ------------------------------------------------------
// CONSULTAR HISTORIAL DE SEGURIDAD
// ------------------------------------------------------

export async function consultarHistorialSeguridad(filtros: FiltrosHistorial) {
  const { usuarioId, rol, desde, hasta, pagina = 1, limite = 20 } = filtros;

  if (!usuarioId) {
    throw new Error("Usuario no identificado");
  }

  const paginaSegura = Math.max(1, Math.floor(pagina));

  const limiteSeguro = Math.min(
    LIMITE_POR_PAGINA,
    Math.max(1, Math.floor(limite)),
  );

  const where: {
    usuarioId?: string;
    creadoEn?: {
      gte?: Date;
      lt?: Date;
    };
  } = {};

  if (rol === "ADMIN") {
    if (desde && hasta) {
      const rango = construirRangoFechas(desde, hasta);

      where.creadoEn = {
        gte: rango.desde,
        lt: rango.hastaExclusivo,
      };
    } else if (desde) {
      where.creadoEn = {
        gte: validarFecha(desde),
      };
    } else if (hasta) {
      where.creadoEn = {
        lt: sumarUnDia(validarFecha(hasta)),
      };
    }
  } else {
    // Los usuarios comunes solo consultan sus propios eventos de hoy.
    const hoy = obtenerFechaArgentina();
    const inicioHoy = validarFecha(hoy);

    where.usuarioId = usuarioId;
    where.creadoEn = {
      gte: inicioHoy,
      lt: sumarUnDia(inicioHoy),
    };
  }

  const [eventos, total] = await prisma.$transaction([
    prisma.eventoSeguridad.findMany({
      where,
      orderBy: {
        creadoEn: "desc",
      },
      skip: (paginaSegura - 1) * limiteSeguro,
      take: limiteSeguro,
      select: {
        id: true,
        usuarioId: true,
        tipo: true,
        descripcion: true,
        ip: true,
        dispositivo: true,
        creadoEn: true,
        usuario: {
          select: {
            nombre: true,
            apellido: true,
            email: true,
            rol: true,
          },
        },
      },
    }),

    prisma.eventoSeguridad.count({
      where,
    }),
  ]);

  return {
    eventos,
    paginacion: {
      pagina: paginaSegura,
      limite: limiteSeguro,
      total,
      totalPaginas: Math.ceil(total / limiteSeguro),
    },
  };
}

// ------------------------------------------------------
// CONTAR REGISTROS PARA PREVISUALIZAR ELIMINACIÓN
// ------------------------------------------------------

export async function contarHistorialParaEliminar(
  rol: string,
  desde?: string,
  hasta?: string,
) {
  verificarAdmin(rol);

  if (!desde && !hasta) {
    return prisma.eventoSeguridad.count();
  }

  if (!desde || !hasta) {
    throw new Error("Debés indicar ambas fechas: desde y hasta");
  }

  validarQueNoSeaFuturo(desde);
  validarQueNoSeaFuturo(hasta);

  const rango = construirRangoFechas(desde, hasta);

  return prisma.eventoSeguridad.count({
    where: {
      creadoEn: {
        gte: rango.desde,
        lt: rango.hastaExclusivo,
      },
    },
  });
}

// ------------------------------------------------------
// ELIMINAR HISTORIAL POR RANGO DE FECHAS
// ------------------------------------------------------

export async function eliminarHistorialPorRango(
  rol: string,
  desde: string,
  hasta: string,
) {
  verificarAdmin(rol);

  if (!desde || !hasta) {
    throw new Error("Debés indicar las fechas desde y hasta");
  }

  validarQueNoSeaFuturo(desde);
  validarQueNoSeaFuturo(hasta);

  const rango = construirRangoFechas(desde, hasta);

  const resultado = await prisma.eventoSeguridad.deleteMany({
    where: {
      creadoEn: {
        gte: rango.desde,
        lt: rango.hastaExclusivo,
      },
    },
  });

  return {
    eliminados: resultado.count,
    desde,
    hasta,
  };
}

// ------------------------------------------------------
// ELIMINAR TODO EL HISTORIAL
// ------------------------------------------------------

export async function eliminarTodoElHistorial(rol: string) {
  verificarAdmin(rol);

  const resultado = await prisma.eventoSeguridad.deleteMany();

  return {
    eliminados: resultado.count,
  };
}
