import { prisma } from "../lib/prisma.js";

/**
 * Obtiene todos los servicios activos.
 */
export async function obtenerServicios() {
  return prisma.servicio.findMany({
    where: {
      activo: true,
    },
    orderBy: {
      nombre: "asc",
    },
  });
}

/**
 * Obtiene los servicios habilitados para un paciente.
 */
export async function obtenerAccesosServiciosPaciente(pacienteId: string) {
  return prisma.accesoServicioPaciente.findMany({
    where: {
      pacienteId,
      habilitado: true,
      servicio: {
        activo: true,
      },
    },
    include: {
      servicio: true,
    },
    orderBy: {
      servicio: {
        nombre: "asc",
      },
    },
  });
}

/**
 * Habilita un servicio para un paciente.
 *
 * Si ya existe el registro, simplemente lo vuelve a habilitar.
 * Si no existe, lo crea.
 */
export async function habilitarServicioPaciente(
  pacienteId: string,
  servicioId: string,
  habilitadoPorId: string,
) {
  const paciente = await prisma.usuario.findUnique({
    where: {
      id: pacienteId,
    },
    select: {
      id: true,
      rol: true,
    },
  });

  if (!paciente) {
    throw new Error("El paciente no existe.");
  }

  if (paciente.rol !== "PACIENTE") {
    throw new Error("El usuario indicado no es un paciente.");
  }

  const servicio = await prisma.servicio.findUnique({
    where: {
      id: servicioId,
    },
    select: {
      id: true,
      nombre: true,
      activo: true,
    },
  });

  if (!servicio) {
    throw new Error("El servicio no existe.");
  }

  if (!servicio.activo) {
    throw new Error("El servicio no está activo.");
  }

  return prisma.accesoServicioPaciente.upsert({
    where: {
      pacienteId_servicioId: {
        pacienteId,
        servicioId,
      },
    },
    update: {
      habilitado: true,
      habilitadoPorId,
    },
    create: {
      pacienteId,
      servicioId,
      habilitado: true,
      habilitadoPorId,
    },
    include: {
      servicio: true,
      paciente: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Deshabilita un servicio para un paciente.
 *
 * No elimina el registro de la base de datos.
 * Simplemente cambia habilitado a false.
 */
export async function deshabilitarServicioPaciente(
  pacienteId: string,
  servicioId: string,
) {
  const acceso = await prisma.accesoServicioPaciente.findUnique({
    where: {
      pacienteId_servicioId: {
        pacienteId,
        servicioId,
      },
    },
  });

  if (!acceso) {
    throw new Error("El paciente no tiene registrado este servicio.");
  }

  return prisma.accesoServicioPaciente.update({
    where: {
      id: acceso.id,
    },
    data: {
      habilitado: false,
    },
    include: {
      servicio: true,
      paciente: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          email: true,
        },
      },
    },
  });
}
