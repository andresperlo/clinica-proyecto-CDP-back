import argon2 from "argon2";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { prisma } from "../lib/prisma.js";

import { enviarCodigoVerificacion } from "./email.service.js";

// ------------------------------------------------------

// CONFIGURACIÓN

// ------------------------------------------------------

const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

const DURACION_CODIGO_MS = 5 * 60 * 1000;

const DURACION_SOLICITUD_MS = 10 * 60 * 1000;

const MAX_INTENTOS_CODIGO = 3;

const DURACION_BLOQUEO_MS = 5 * 60 * 1000;

const TOLERANCIA_HEARTBEAT_MS = 30 * 1000;

// ------------------------------------------------------

// TIPOS

// ------------------------------------------------------

export interface LoginInput {
  email: string;

  password: string;
}

export interface RegisterInput {
  nombre: string;

  apellido: string;

  email: string;

  password: string;
}

export interface DatosDispositivo {
  dispositivo?: string;

  navegador?: string;

  sistemaOperativo?: string;

  ip?: string;
}

interface ResultadoSesion {
  token: string;

  expiresAt: Date;

  sesionId: string;
}

interface ResultadoSolicitudSegundoDispositivo {
  solicitudId: string;

  challengeToken: string;

  opciones: string[];

  venceEn: Date;

  emailDestino: string;
}

interface SolicitudConCodigo {
  id: string;

  dispositivo: string | null;

  navegador: string | null;

  sistemaOperativo: string | null;

  ip: string | null;

  codigoAprobacionCifrado: string | null;

  venceEn: Date;

  creadaEn: Date;
}

// ------------------------------------------------------

// FUNCIONES AUXILIARES

// ------------------------------------------------------

function generarTokenSeguro(): string {
  return randomBytes(32).toString("base64url");
}

function calcularHashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generarCodigoVerificacion(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function calcularHashCodigo(codigo: string): string {
  const secret = process.env.VERIFICATION_CODE_SECRET;

  if (!secret) {
    throw new Error("Falta configurar VERIFICATION_CODE_SECRET");
  }

  return createHmac("sha256", secret).update(codigo).digest("hex");
}

function compararHashCodigo(codigo: string, hashGuardado: string): boolean {
  const hashIngresado = Buffer.from(calcularHashCodigo(codigo), "hex");

  const hashOriginal = Buffer.from(hashGuardado, "hex");

  if (hashIngresado.length !== hashOriginal.length) {
    return false;
  }

  return timingSafeEqual(hashIngresado, hashOriginal);
}

function calcularHashAprobacion(codigo: string): string {
  const secret = process.env.VERIFICATION_CODE_SECRET;

  if (!secret) {
    throw new Error("Falta configurar VERIFICATION_CODE_SECRET");
  }

  return createHmac("sha256", secret)
    .update(`device-approval:${codigo}`)

    .digest("hex");
}

function compararHashAprobacion(codigo: string, hashGuardado: string): boolean {
  const hashIngresado = Buffer.from(calcularHashAprobacion(codigo), "hex");

  const hashOriginal = Buffer.from(hashGuardado, "hex");

  if (hashIngresado.length !== hashOriginal.length) {
    return false;
  }

  return timingSafeEqual(hashIngresado, hashOriginal);
}

function enmascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");

  if (!usuario || !dominio) {
    return "***";
  }

  const visible = usuario.length > 2 ? usuario.slice(0, 2) : usuario[0];

  return `${visible}***@${dominio}`;
}

// ------------------------------------------------------

// CIFRADO AES-256-GCM

// ------------------------------------------------------

function obtenerClaveCifrado(): Buffer {
  const claveConfigurada = process.env.DEVICE_APPROVAL_ENCRYPTION_KEY;

  if (!claveConfigurada) {
    throw new Error("Falta configurar DEVICE_APPROVAL_ENCRYPTION_KEY");
  }

  let clave: Buffer;

  if (/^[a-fA-F0-9]{64}$/.test(claveConfigurada)) {
    clave = Buffer.from(claveConfigurada, "hex");
  } else {
    clave = Buffer.from(claveConfigurada, "base64");
  }

  if (clave.length !== 32) {
    throw new Error(
      "DEVICE_APPROVAL_ENCRYPTION_KEY debe representar exactamente 32 bytes",
    );
  }

  return clave;
}

function cifrarCodigoAprobacion(codigo: string): string {
  const clave = obtenerClaveCifrado();

  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", clave, iv);

  const cifrado = Buffer.concat([
    cipher.update(codigo, "utf8"),

    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Formato: IV.TAG.CIFRADO

  return [
    iv.toString("base64url"),

    tag.toString("base64url"),

    cifrado.toString("base64url"),
  ].join(".");
}

function descifrarCodigoAprobacion(codigoCifrado: string): string {
  const clave = obtenerClaveCifrado();

  const partes = codigoCifrado.split(".");

  if (partes.length !== 3) {
    throw new Error("El código cifrado tiene un formato inválido");
  }

  const [ivTexto, tagTexto, cifradoTexto] = partes;

  if (!ivTexto || !tagTexto || !cifradoTexto) {
    throw new Error("No se pudo interpretar el código cifrado");
  }

  const iv = Buffer.from(ivTexto, "base64url");

  const tag = Buffer.from(tagTexto, "base64url");

  const cifrado = Buffer.from(cifradoTexto, "base64url");

  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Los datos del código cifrado son inválidos");
  }

  const decipher = createDecipheriv("aes-256-gcm", clave, iv);

  decipher.setAuthTag(tag);

  const descifrado = Buffer.concat([
    decipher.update(cifrado),

    decipher.final(),
  ]);

  return descifrado.toString("utf8");
}

// ------------------------------------------------------

// GENERACIÓN DE LOS TRES NÚMEROS

// ------------------------------------------------------

function generarOpcionesAprobacion(): {
  codigoCorrecto: string;

  opciones: string[];
} {
  const codigoCorrecto = randomInt(100, 1000).toString();

  const opciones = new Set<string>();

  opciones.add(codigoCorrecto);

  while (opciones.size < 3) {
    opciones.add(randomInt(100, 1000).toString());
  }

  const opcionesMezcladas = Array.from(opciones);

  // Mezclar las tres opciones.

  for (let i = opcionesMezcladas.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);

    [opcionesMezcladas[i], opcionesMezcladas[j]] = [
      opcionesMezcladas[j]!,

      opcionesMezcladas[i]!,
    ];
  }

  return {
    codigoCorrecto,

    opciones: opcionesMezcladas,
  };
}

/** Serializa operaciones críticas sobre una sesión mediante un advisory lock de PostgreSQL.

 * El bloqueo se libera automáticamente al finalizar la transacción.

 */

async function bloquearSesion(tx: any, sesionId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`session:${sesionId}`}, 2))`;
}

// ------------------------------------------------------

// VALIDAR DISPOSITIVO PRINCIPAL

// ------------------------------------------------------

async function validarDispositivoPrincipal(
  usuarioId: string,
  sesionId: string,
  dispositivoId: string,
) {
  const ahora = new Date();

  const dispositivo = await prisma.dispositivo.findFirst({
    where: {
      id: dispositivoId,
      usuarioId,
      sesionId,
      estado: "ACTIVO",
      esPrincipal: true,
      sesion: {
        estado: "ACTIVA",
        venceEn: { gt: ahora },
        dispositivoPrincipalId: dispositivoId,
        principalDesconectadoEn: null,
      },
    },
    include: { sesion: true },
  });

  if (!dispositivo) {
    throw new Error(
      "El dispositivo principal no está autorizado o la sesión venció",
    );
  }

  return dispositivo;
}

async function validarHeartbeatPrincipal(
  tx: any,
  usuarioId: string,
  sesionId: string,
  dispositivoId: string,
  ahora = new Date(),
) {
  const limiteHeartbeat = new Date(ahora.getTime() - TOLERANCIA_HEARTBEAT_MS);
  const principal = await tx.dispositivo.findFirst({
    where: {
      id: dispositivoId,
      usuarioId,
      sesionId,
      estado: "ACTIVO",
      esPrincipal: true,
      sesion: {
        estado: "ACTIVA",
        venceEn: { gt: ahora },
        dispositivoPrincipalId: dispositivoId,
        ultimoHeartbeat: { gt: limiteHeartbeat },
        principalDesconectadoEn: null,
      },
    },
    select: { id: true },
  });

  if (!principal) {
    throw new Error("El dispositivo principal perdió autorización o conexión");
  }
}

// ------------------------------------------------------

// CREAR SESIÓN Y DISPOSITIVO PRINCIPAL

// ------------------------------------------------------

async function crearSesion(
  usuarioId: string,

  dispositivo: DatosDispositivo = {},
): Promise<ResultadoSesion> {
  const ahora = new Date();

  const venceEn = new Date(ahora.getTime() + DURACION_SESION_MS);

  const token = generarTokenSeguro();

  const tokenHash = calcularHashToken(token);

  const sesion = await prisma.$transaction(async (tx) => {
    // Evita que dos logins simultáneos creen dos sesiones principales.

    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${usuarioId}, 0))`;

    // Buscar sesiones anteriores que ya vencieron.

    const sesionesVencidas = await tx.sesion.findMany({
      where: {
        usuarioId,

        estado: "ACTIVA",

        venceEn: {
          lte: ahora,
        },
      },

      select: {
        id: true,
      },
    });

    if (sesionesVencidas.length > 0) {
      const ids = sesionesVencidas.map((item) => item.id);

      await tx.sesion.updateMany({
        where: {
          id: {
            in: ids,
          },

          estado: "ACTIVA",
        },

        data: {
          estado: "VENCIDA",

          revocadoEn: ahora,

          motivoRevocacion: "Tiempo máximo de sesión alcanzado",
        },
      });

      await tx.dispositivo.updateMany({
        where: {
          sesionId: {
            in: ids,
          },

          estado: {
            in: ["ACTIVO", "DESCONECTADO"],
          },
        },

        data: {
          estado: "REVOCADO",

          revocadoEn: ahora,
        },
      });
    }

    // Comprobar que no exista otra sesión vigente.

    const sesionActiva = await tx.sesion.findFirst({
      where: {
        usuarioId,

        estado: "ACTIVA",

        venceEn: {
          gt: ahora,
        },
      },

      select: {
        id: true,
      },
    });

    if (sesionActiva) {
      throw new Error(
        "Ya existe una sesión activa. Se requiere autorización del dispositivo anterior.",
      );
    }

    // Crear la sesión lógica.

    const nuevaSesion = await tx.sesion.create({
      data: {
        usuarioId,

        estado: "ACTIVA",

        venceEn,

        ultimoHeartbeat: ahora,
      },
    });

    // Crear el primer dispositivo como principal.

    const dispositivoPrincipal = await tx.dispositivo.create({
      data: {
        usuarioId,

        sesionId: nuevaSesion.id,

        tokenHash,

        estado: "ACTIVO",

        esPrincipal: true,

        ultimoHeartbeat: ahora,

        ...(dispositivo.dispositivo !== undefined && {
          nombre: dispositivo.dispositivo,
        }),

        ...(dispositivo.navegador !== undefined && {
          navegador: dispositivo.navegador,
        }),

        ...(dispositivo.sistemaOperativo !== undefined && {
          sistemaOperativo: dispositivo.sistemaOperativo,
        }),

        ...(dispositivo.ip !== undefined && {
          ip: dispositivo.ip,
        }),
      },
    });

    // Asociar el dispositivo principal a la sesión.

    await tx.sesion.update({
      where: {
        id: nuevaSesion.id,
      },

      data: {
        dispositivoPrincipalId: dispositivoPrincipal.id,
      },
    });

    await tx.eventoSeguridad.create({
      data: {
        usuarioId,

        tipo: "LOGIN_EXITOSO",

        descripcion: "Inicio de sesión correcto. Dispositivo principal creado.",

        ...(dispositivo.ip !== undefined && {
          ip: dispositivo.ip,
        }),

        ...(dispositivo.dispositivo !== undefined && {
          dispositivo: dispositivo.dispositivo,
        }),
      },
    });

    return nuevaSesion;
  });

  return {
    token,

    expiresAt: sesion.venceEn,

    sesionId: sesion.id,
  };
}

// ------------------------------------------------------

// LOGIN

// ------------------------------------------------------

export async function login(
  input: LoginInput,

  datosDispositivo: DatosDispositivo = {},
) {
  const email = input.email.trim().toLowerCase();

  const usuario = await prisma.usuario.findUnique({
    where: {
      email,
    },
  });

  if (
    !usuario ||
    usuario.estado !== "ACTIVO" ||
    !(await argon2.verify(usuario.passwordHash, input.password))
  ) {
    await prisma.eventoSeguridad.create({
      data: {
        usuarioId: usuario?.id ?? null,

        tipo: "LOGIN_FALLIDO",

        descripcion: "Intento de inicio de sesión con credenciales inválidas",

        ...(datosDispositivo.ip !== undefined && {
          ip: datosDispositivo.ip,
        }),
      },
    });

    throw new Error("Credenciales inválidas");
  }

  const sesion = await crearSesion(usuario.id, datosDispositivo);

  return {
    token: sesion.token,

    expiresAt: sesion.expiresAt,

    usuario: {
      id: usuario.id,

      nombre: usuario.nombre,

      apellido: usuario.apellido,

      email: usuario.email,

      rol: usuario.rol,
    },
  };
}

// ------------------------------------------------------

// REGISTRO

// ------------------------------------------------------

export async function register(
  input: RegisterInput,

  datosDispositivo: DatosDispositivo = {},
) {
  const nombre = input.nombre.trim();

  const apellido = input.apellido.trim();

  const email = input.email.trim().toLowerCase();

  if (!nombre || !apellido || !email || !input.password) {
    throw new Error("Todos los campos son obligatorios");
  }

  if (input.password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres");
  }

  const usuarioExistente = await prisma.usuario.findUnique({
    where: {
      email,
    },
  });

  if (usuarioExistente) {
    throw new Error("El correo electrónico ya está registrado");
  }

  const passwordHash = await argon2.hash(input.password);

  const usuario = await prisma.usuario.create({
    data: {
      nombre,

      apellido,

      email,

      passwordHash,

      rol: "PACIENTE",

      estado: "ACTIVO",
    },

    select: {
      id: true,

      nombre: true,

      apellido: true,

      email: true,

      rol: true,
    },
  });

  try {
    const sesion = await crearSesion(usuario.id, datosDispositivo);

    return {
      token: sesion.token,

      expiresAt: sesion.expiresAt,

      usuario,
    };
  } catch (error) {
    // No dejar una cuenta creada sin sesión inicial si el alta no pudo completarse.

    try {
      await prisma.usuario.delete({ where: { id: usuario.id } });
    } catch (errorEliminacion) {
      console.error("No se pudo revertir el usuario creado:", errorEliminacion);
    }

    throw error;
  }
}

// ------------------------------------------------------

// SOLICITAR ACCESO DESDE UN SEGUNDO DISPOSITIVO

// ------------------------------------------------------

export async function solicitarCodigoSegundoDispositivo(
  usuarioId: string,
  dispositivo: DatosDispositivo = {},
): Promise<ResultadoSolicitudSegundoDispositivo> {
  const ahora = new Date();

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      email: true,
      estado: true,
    },
  });

  if (!usuario || usuario.estado !== "ACTIVO") {
    throw new Error("No se pudo procesar la solicitud");
  }

  // Generar código y credenciales temporales.
  const codigoEmail = generarCodigoVerificacion();
  const codigoEmailHash = calcularHashCodigo(codigoEmail);

  const challengeToken = generarTokenSeguro();
  const challengeTokenHash = calcularHashToken(challengeToken);

  const { codigoCorrecto, opciones } = generarOpcionesAprobacion();

  const codigoAprobacionHash = calcularHashAprobacion(codigoCorrecto);

  const codigoAprobacionCifrado = cifrarCodigoAprobacion(codigoCorrecto);

  const venceCodigo = new Date(ahora.getTime() + DURACION_CODIGO_MS);

  const venceSolicitud = new Date(ahora.getTime() + DURACION_SOLICITUD_MS);

  // Serializar todas las solicitudes del mismo usuario.
  const solicitud = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${usuarioId}, 1)
      )
    `;

    // Comprobar que exista un dispositivo principal autorizado.
    const sesionActiva = await tx.sesion.findFirst({
      where: {
        usuarioId,
        estado: "ACTIVA",
        venceEn: { gt: ahora },
        dispositivos: {
          some: {
            estado: "ACTIVO",
            esPrincipal: true,
          },
        },
      },
      select: { id: true },
    });

    if (!sesionActiva) {
      throw new Error("No existe un dispositivo principal autorizado activo");
    }

    // Verificar si el usuario todavía está bloqueado.
    const bloqueo = await tx.codigoVerificacion.findFirst({
      where: {
        usuarioId,
        estado: "BLOQUEADO",
        bloqueadoHasta: { gt: ahora },
      },
      orderBy: { creadoEn: "desc" },
      select: { bloqueadoHasta: true },
    });

    if (bloqueo?.bloqueadoHasta) {
      throw new Error(
        "Demasiados intentos. Debés esperar cinco minutos antes de solicitar otro código.",
      );
    }

    // Cancelar solicitudes anteriores todavía vigentes.
    await tx.solicitudAcceso.updateMany({
      where: {
        usuarioId,
        estado: { in: ["PENDIENTE", "APROBADA"] },
      },
      data: {
        estado: "CANCELADA",
        codigoAprobacionHash: null,
        codigoAprobacionCifrado: null,
      },
    });

    // Invalidar códigos anteriores.
    await tx.codigoVerificacion.updateMany({
      where: {
        usuarioId,
        estado: { in: ["PENDIENTE", "BLOQUEADO"] },
      },
      data: {
        estado: "EXPIRADO",
      },
    });

    // Crear la nueva solicitud.
    const nuevaSolicitud = await tx.solicitudAcceso.create({
      data: {
        usuarioId,
        estado: "PENDIENTE",
        venceEn: venceSolicitud,
        challengeTokenHash,
        codigoAprobacionHash,
        codigoAprobacionCifrado,

        ...(dispositivo.dispositivo !== undefined && {
          dispositivo: dispositivo.dispositivo,
        }),

        ...(dispositivo.navegador !== undefined && {
          navegador: dispositivo.navegador,
        }),

        ...(dispositivo.sistemaOperativo !== undefined && {
          sistemaOperativo: dispositivo.sistemaOperativo,
        }),

        ...(dispositivo.ip !== undefined && {
          ip: dispositivo.ip,
        }),
      },
    });

    // Crear el código de verificación del correo.
    await tx.codigoVerificacion.create({
      data: {
        usuarioId,
        solicitudAccesoId: nuevaSolicitud.id,
        codigoHash: codigoEmailHash,
        estado: "PENDIENTE",
        venceEn: venceCodigo,
      },
    });

    // Registrar el evento de seguridad.
    await tx.eventoSeguridad.create({
      data: {
        usuarioId,
        tipo: "SEGUNDO_DISPOSITIVO_SOLICITADO",
        descripcion: "Solicitud de acceso desde un segundo dispositivo",

        ...(dispositivo.ip !== undefined && {
          ip: dispositivo.ip,
        }),

        ...(dispositivo.dispositivo !== undefined && {
          dispositivo: dispositivo.dispositivo,
        }),
      },
    });

    return nuevaSolicitud;
  });

  // Enviar el código una vez confirmada la transacción.
  try {
    await enviarCodigoVerificacion(usuario.email, codigoEmail);

    await prisma.eventoSeguridad.create({
      data: {
        usuarioId,
        tipo: "CODIGO_EMAIL_ENVIADO",
        descripcion: "Código de verificación enviado al correo registrado",

        ...(dispositivo.ip !== undefined && {
          ip: dispositivo.ip,
        }),

        ...(dispositivo.dispositivo !== undefined && {
          dispositivo: dispositivo.dispositivo,
        }),
      },
    });
  } catch {
    await prisma.$transaction(async (tx) => {
      const cancelada = await tx.solicitudAcceso.updateMany({
        where: {
          id: solicitud.id,
          estado: "PENDIENTE",
        },
        data: {
          estado: "CANCELADA",
          codigoAprobacionHash: null,
          codigoAprobacionCifrado: null,
        },
      });

      if (cancelada.count === 1) {
        await tx.codigoVerificacion.updateMany({
          where: {
            solicitudAccesoId: solicitud.id,
            estado: { in: ["PENDIENTE", "BLOQUEADO"] },
          },
          data: { estado: "EXPIRADO" },
        });

        await tx.eventoSeguridad.create({
          data: {
            usuarioId,
            tipo: "CODIGO_EMAIL_FALLIDO",
            descripcion: "No se pudo enviar el código de verificación",

            ...(dispositivo.ip !== undefined && {
              ip: dispositivo.ip,
            }),

            ...(dispositivo.dispositivo !== undefined && {
              dispositivo: dispositivo.dispositivo,
            }),
          },
        });
      }
    });

    throw new Error("No se pudo enviar el código de verificación");
  }

  return {
    solicitudId: solicitud.id,
    challengeToken,
    opciones,
    venceEn: venceSolicitud,
    emailDestino: enmascararEmail(usuario.email),
  };
}

// ------------------------------------------------------

// VERIFICAR CÓDIGO DEL SEGUNDO DISPOSITIVO

// ------------------------------------------------------

export async function verificarCodigoSegundoDispositivo(
  usuarioId: string,
  solicitudId: string,
  codigo: string,
  challengeToken: string,
  datosDispositivo: {
    ip?: string;
    dispositivo?: string;
    navegador?: string;
  } = {},
) {
  if (!/^\d{6}$/.test(codigo)) {
    throw new Error("El código debe contener seis números");
  }

  if (!challengeToken || challengeToken.length < 32) {
    throw new Error("Solicitud de acceso inválida");
  }

  const ahora = new Date();

  const solicitud = await prisma.solicitudAcceso.findFirst({
    where: {
      id: solicitudId,
      usuarioId,
      estado: "PENDIENTE",
      venceEn: { gt: ahora },
      challengeTokenHash: calcularHashToken(challengeToken),
    },
    include: {
      codigos: {
        where: {
          estado: { in: ["PENDIENTE", "BLOQUEADO"] },
        },
        orderBy: { creadoEn: "desc" },
        take: 1,
      },
    },
  });

  const registro = solicitud?.codigos[0];

  if (!solicitud || !registro) {
    throw new Error("La solicitud o el código ya no son válidos");
  }

  if (registro.estado === "BLOQUEADO") {
    if (registro.bloqueadoHasta && registro.bloqueadoHasta > ahora) {
      throw new Error("El código está bloqueado. Debés esperar cinco minutos.");
    }

    throw new Error("El código está bloqueado. Solicitá uno nuevo.");
  }

  if (registro.venceEn <= ahora) {
    await prisma.$transaction(async (tx) => {
      const actualizacion = await tx.codigoVerificacion.updateMany({
        where: {
          id: registro.id,
          estado: "PENDIENTE",
          venceEn: { lte: ahora },
        },
        data: { estado: "EXPIRADO" },
      });

      if (actualizacion.count === 1) {
        await tx.eventoSeguridad.create({
          data: {
            usuarioId,
            tipo: "CODIGO_EMAIL_EXPIRADO",
            descripcion:
              "El código de verificación del correo electrónico venció",
            ...(datosDispositivo.ip && {
              ip: datosDispositivo.ip,
            }),
            ...(datosDispositivo.dispositivo && {
              dispositivo: datosDispositivo.dispositivo,
            }),
          },
        });
      }
    });

    throw new Error("El código venció. Solicitá uno nuevo");
  }

  const codigoCorrecto = compararHashCodigo(codigo, registro.codigoHash);

  if (!codigoCorrecto) {
    const nuevosIntentos = registro.intentos + 1;
    const bloqueoAlcanzado = nuevosIntentos >= MAX_INTENTOS_CODIGO;

    const resultado = await prisma.$transaction(async (tx) => {
      const actualizacion = await tx.codigoVerificacion.updateMany({
        where: {
          id: registro.id,
          estado: "PENDIENTE",
          intentos: registro.intentos,
          venceEn: { gt: ahora },
        },
        data: {
          intentos: { increment: 1 },
          ...(bloqueoAlcanzado
            ? {
                estado: "BLOQUEADO" as const,
                bloqueadoHasta: new Date(ahora.getTime() + DURACION_BLOQUEO_MS),
              }
            : {}),
        },
      });

      if (actualizacion.count !== 1) {
        return { actualizado: false };
      }

      await tx.eventoSeguridad.create({
        data: {
          usuarioId,
          tipo: "CODIGO_EMAIL_FALLIDO",
          descripcion: bloqueoAlcanzado
            ? "Código incorrecto. Se alcanzó el máximo de intentos"
            : "Código de verificación incorrecto",
          ...(datosDispositivo.ip && {
            ip: datosDispositivo.ip,
          }),
          ...(datosDispositivo.dispositivo && {
            dispositivo: datosDispositivo.dispositivo,
          }),
        },
      });

      return { actualizado: true };
    });

    if (!resultado.actualizado) {
      throw new Error(
        "El código fue modificado por otra solicitud. Intentá nuevamente.",
      );
    }

    if (bloqueoAlcanzado) {
      throw new Error(
        "Alcanzaste los tres intentos. Debés esperar cinco minutos para solicitar otro código.",
      );
    }

    throw new Error("Código incorrecto");
  }

  await prisma.$transaction(async (tx) => {
    const resultado = await tx.codigoVerificacion.updateMany({
      where: {
        id: registro.id,
        estado: "PENDIENTE",
        intentos: registro.intentos,
        venceEn: { gt: ahora },
      },
      data: {
        estado: "UTILIZADO",
        utilizadoEn: ahora,
      },
    });

    if (resultado.count !== 1) {
      throw new Error("El código ya fue utilizado o venció");
    }

    const solicitudActualizada = await tx.solicitudAcceso.updateMany({
      where: {
        id: solicitudId,
        usuarioId,
        estado: "PENDIENTE",
        venceEn: { gt: ahora },
        challengeTokenHash: calcularHashToken(challengeToken),
        emailVerificadoEn: null,
      },
      data: { emailVerificadoEn: ahora },
    });

    if (solicitudActualizada.count !== 1) {
      throw new Error("La solicitud fue cancelada, venció o ya fue verificada");
    }

    await tx.eventoSeguridad.create({
      data: {
        usuarioId,
        tipo: "CODIGO_EMAIL_VALIDADO",
        descripcion: "Código de verificación validado correctamente",
        ...(datosDispositivo.ip && {
          ip: datosDispositivo.ip,
        }),
        ...(datosDispositivo.dispositivo && {
          dispositivo: datosDispositivo.dispositivo,
        }),
      },
    });
  });

  return {
    verificado: true,
    mensaje:
      "Correo verificado. Falta la aprobación desde el dispositivo autorizado.",
  };
}

// ------------------------------------------------------

// LISTAR SOLICITUDES PENDIENTES PARA EL PRINCIPAL

// ------------------------------------------------------

export async function listarSolicitudesPendientesSegundoDispositivo(
  usuarioId: string,

  sesionId: string,

  dispositivoId: string,
) {
  await validarDispositivoPrincipal(usuarioId, sesionId, dispositivoId);

  const ahora = new Date();

  const solicitudes = await prisma.solicitudAcceso.findMany({
    where: {
      usuarioId,

      estado: "PENDIENTE",

      emailVerificadoEn: {
        not: null,
      },

      venceEn: {
        gt: ahora,
      },

      codigoAprobacionCifrado: {
        not: null,
      },
    },

    orderBy: {
      creadaEn: "desc",
    },

    select: {
      id: true,

      dispositivo: true,

      navegador: true,

      sistemaOperativo: true,

      ip: true,

      codigoAprobacionCifrado: true,

      venceEn: true,

      creadaEn: true,
    },
  });

  return solicitudes.map((solicitud: SolicitudConCodigo) => {
    if (!solicitud.codigoAprobacionCifrado) {
      throw new Error(
        "La solicitud no tiene un código de aprobación disponible",
      );
    }

    const codigoCorrecto = descifrarCodigoAprobacion(
      solicitud.codigoAprobacionCifrado,
    );

    return {
      solicitudId: solicitud.id,

      dispositivo: solicitud.dispositivo,

      navegador: solicitud.navegador,

      sistemaOperativo: solicitud.sistemaOperativo,

      ip: solicitud.ip,

      codigoCorrecto,

      venceEn: solicitud.venceEn,

      creadaEn: solicitud.creadaEn,
    };
  });
}

// ------------------------------------------------------

// APROBAR SEGUNDO DISPOSITIVO DESDE EL PRINCIPAL

// ------------------------------------------------------

export async function aprobarSegundoDispositivo(
  usuarioId: string,
  sesionId: string,
  dispositivoId: string,
  solicitudId: string,
  codigoElegido: string,
) {
  if (!/^\d{3}$/.test(codigoElegido)) {
    throw new Error("El número de aprobación debe tener tres dígitos");
  }

  const ahora = new Date();

  const resultado = await prisma.$transaction(async (tx) => {
    await bloquearSesion(tx, sesionId);

    await validarHeartbeatPrincipal(
      tx,
      usuarioId,
      sesionId,
      dispositivoId,
      ahora,
    );

    const solicitud = await tx.solicitudAcceso.findFirst({
      where: {
        id: solicitudId,
        usuarioId,
        estado: "PENDIENTE",
        emailVerificadoEn: { not: null },
        venceEn: { gt: ahora },
      },
    });

    if (!solicitud?.codigoAprobacionHash) {
      throw new Error("La solicitud no existe o ya no puede aprobarse");
    }

    if (
      !compararHashAprobacion(codigoElegido, solicitud.codigoAprobacionHash)
    ) {
      await tx.eventoSeguridad.create({
        data: {
          usuarioId,
          tipo: "CODIGO_APROBACION_FALLIDO",
          descripcion:
            "El dispositivo principal ingresó un número de aprobación incorrecto",
        },
      });

      return { codigoIncorrecto: true };
    }

    const actualizacion = await tx.solicitudAcceso.updateMany({
      where: {
        id: solicitudId,
        usuarioId,
        estado: "PENDIENTE",
        venceEn: { gt: ahora },
        emailVerificadoEn: { not: null },
        codigoAprobacionHash: solicitud.codigoAprobacionHash,
      },
      data: {
        estado: "APROBADA",
        aprobadaEn: ahora,
        aprobadaPorSesionId: sesionId,
      },
    });

    if (actualizacion.count !== 1) {
      throw new Error("La solicitud ya fue procesada o venció");
    }

    await tx.eventoSeguridad.create({
      data: {
        usuarioId,
        tipo: "SEGUNDO_DISPOSITIVO_APROBADO",
        descripcion:
          "El dispositivo principal aprobó el acceso del segundo dispositivo",
      },
    });

    return { codigoIncorrecto: false };
  });

  if (resultado.codigoIncorrecto) {
    throw new Error("El número seleccionado no es correcto");
  }

  return {
    aprobado: true,
    mensaje:
      "Dispositivo aprobado. Falta completar la vinculación desde el segundo dispositivo.",
  };
}

// ------------------------------------------------------

// RECHAZAR SEGUNDO DISPOSITIVO DESDE EL PRINCIPAL

// ------------------------------------------------------

export async function rechazarSegundoDispositivo(
  usuarioId: string,
  sesionId: string,
  dispositivoId: string,
  solicitudId: string,
) {
  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    await bloquearSesion(tx, sesionId);

    await validarHeartbeatPrincipal(
      tx,
      usuarioId,
      sesionId,
      dispositivoId,
      ahora,
    );

    const resultado = await tx.solicitudAcceso.updateMany({
      where: {
        id: solicitudId,
        usuarioId,
        estado: "PENDIENTE",
        emailVerificadoEn: { not: null },
        venceEn: { gt: ahora },
      },
      data: {
        estado: "RECHAZADA",
        rechazadaEn: ahora,
        codigoAprobacionHash: null,
        codigoAprobacionCifrado: null,
      },
    });

    if (resultado.count !== 1) {
      throw new Error("La solicitud ya fue procesada o venció");
    }

    await tx.codigoVerificacion.updateMany({
      where: {
        solicitudAccesoId: solicitudId,
        estado: { in: ["PENDIENTE", "BLOQUEADO"] },
      },
      data: {
        estado: "EXPIRADO",
      },
    });

    await tx.eventoSeguridad.create({
      data: {
        usuarioId,
        tipo: "SEGUNDO_DISPOSITIVO_RECHAZADO",
        descripcion: "El dispositivo principal rechazó la solicitud de acceso",
      },
    });
  });

  return {
    rechazado: true,
    mensaje: "La solicitud de acceso fue rechazada",
  };
}

export async function cancelarSolicitudSegundoDispositivo(
  solicitudId: string,

  challengeToken: string,
) {
  if (!solicitudId || !challengeToken || challengeToken.length < 32) {
    throw new Error("Solicitud de acceso inválida");
  }

  const ahora = new Date();

  const challengeTokenHash = calcularHashToken(challengeToken);

  return prisma.$transaction(async (tx) => {
    const solicitud = await tx.solicitudAcceso.findFirst({
      where: {
        id: solicitudId,

        challengeTokenHash,

        estado: {
          in: ["PENDIENTE", "APROBADA"],
        },

        venceEn: {
          gt: ahora,
        },
      },

      select: {
        id: true,

        usuarioId: true,
      },
    });

    if (!solicitud) {
      throw new Error("La solicitud ya fue procesada, cancelada o venció");
    }

    const actualizacion = await tx.solicitudAcceso.updateMany({
      where: {
        id: solicitud.id,

        challengeTokenHash,

        estado: {
          in: ["PENDIENTE", "APROBADA"],
        },

        venceEn: {
          gt: ahora,
        },
      },

      data: {
        estado: "CANCELADA",

        codigoAprobacionHash: null,

        codigoAprobacionCifrado: null,
      },
    });

    if (actualizacion.count !== 1) {
      throw new Error("La solicitud ya fue procesada");
    }

    await tx.codigoVerificacion.updateMany({
      where: {
        solicitudAccesoId: solicitud.id,

        estado: {
          in: ["PENDIENTE", "BLOQUEADO"],
        },
      },

      data: {
        estado: "EXPIRADO",
      },
    });

    await tx.eventoSeguridad.create({
      data: {
        usuarioId: solicitud.usuarioId,

        tipo: "SEGUNDO_DISPOSITIVO_CANCELADO",

        descripcion:
          "El usuario canceló la solicitud de acceso desde el segundo dispositivo",
      },
    });

    return {
      cancelada: true,

      mensaje: "La solicitud fue cancelada correctamente",
    };
  });
}

// ------------------------------------------------------

// COMPLETAR VINCULACIÓN DEL SEGUNDO DISPOSITIVO

// ------------------------------------------------------

export async function completarVinculacionSegundoDispositivo(
  solicitudId: string,
  challengeToken: string,
  datosDispositivo: DatosDispositivo = {},
): Promise<ResultadoSesion> {
  if (!challengeToken || challengeToken.length < 32) {
    throw new Error("Solicitud de acceso inválida");
  }

  const ahora = new Date();

  const challengeTokenHash = calcularHashToken(challengeToken);

  const token = generarTokenSeguro();
  const tokenHash = calcularHashToken(token);

  const resultado = await prisma.$transaction(async (tx) => {
    // 1. Obtener la solicitud aprobada.
    const solicitudInicial = await tx.solicitudAcceso.findFirst({
      where: {
        id: solicitudId,
        challengeTokenHash,
        estado: "APROBADA",
        emailVerificadoEn: { not: null },
        venceEn: { gt: ahora },
      },
      select: {
        id: true,
        usuarioId: true,
        aprobadaPorSesionId: true,
      },
    });

    if (!solicitudInicial?.aprobadaPorSesionId) {
      throw new Error("La solicitud no existe, venció o no fue aprobada");
    }

    // 2. Bloquear la sesión para evitar operaciones simultáneas.
    await bloquearSesion(tx, solicitudInicial.aprobadaPorSesionId);

    // 3. Volver a comprobar la solicitud después del bloqueo.
    const solicitud = await tx.solicitudAcceso.findFirst({
      where: {
        id: solicitudId,
        usuarioId: solicitudInicial.usuarioId,
        challengeTokenHash,
        estado: "APROBADA",
        emailVerificadoEn: { not: null },
        venceEn: { gt: new Date() },
        aprobadaPorSesionId: solicitudInicial.aprobadaPorSesionId,
      },
    });

    if (!solicitud?.aprobadaPorSesionId) {
      throw new Error("La solicitud dejó de estar aprobada");
    }

    // 4. Validar que la sesión original siga activa.
    const ahoraValidacion = new Date();

    const limiteHeartbeat = new Date(
      ahoraValidacion.getTime() - TOLERANCIA_HEARTBEAT_MS,
    );

    const sesion = await tx.sesion.findFirst({
      where: {
        id: solicitud.aprobadaPorSesionId,
        usuarioId: solicitud.usuarioId,
        estado: "ACTIVA",
        venceEn: { gt: ahoraValidacion },
        ultimoHeartbeat: { gt: limiteHeartbeat },
        principalDesconectadoEn: null,
      },
    });

    if (!sesion?.dispositivoPrincipalId) {
      throw new Error(
        "La sesión principal ya no está activa o perdió conexión",
      );
    }

    // 5. Comprobar que el dispositivo principal siga autorizado.
    const principal = await tx.dispositivo.findFirst({
      where: {
        id: sesion.dispositivoPrincipalId,
        usuarioId: solicitud.usuarioId,
        sesionId: sesion.id,
        estado: "ACTIVO",
        esPrincipal: true,
      },
      select: { id: true },
    });

    if (!principal) {
      throw new Error("El dispositivo principal ya no está autorizado");
    }

    // 6. Consumir la solicitud una sola vez.
    const actualizacion = await tx.solicitudAcceso.updateMany({
      where: {
        id: solicitud.id,
        usuarioId: solicitud.usuarioId,
        estado: "APROBADA",
        challengeTokenHash,
        emailVerificadoEn: { not: null },
        aprobadaPorSesionId: sesion.id,
        venceEn: { gt: ahoraValidacion },
      },
      data: {
        estado: "COMPLETADA",
        completadaEn: ahoraValidacion,
        codigoAprobacionHash: null,
        codigoAprobacionCifrado: null,
      },
    });

    if (actualizacion.count !== 1) {
      throw new Error("La solicitud ya fue completada por otro proceso");
    }

    // 7. Crear el segundo dispositivo dentro de la sesión original.
    await tx.dispositivo.create({
      data: {
        usuarioId: solicitud.usuarioId,
        sesionId: sesion.id,
        tokenHash,
        estado: "ACTIVO",
        esPrincipal: false,
        ultimoHeartbeat: ahoraValidacion,

        ...(datosDispositivo.dispositivo !== undefined && {
          nombre: datosDispositivo.dispositivo,
        }),

        ...(datosDispositivo.navegador !== undefined && {
          navegador: datosDispositivo.navegador,
        }),

        ...(datosDispositivo.sistemaOperativo !== undefined && {
          sistemaOperativo: datosDispositivo.sistemaOperativo,
        }),

        ...(datosDispositivo.ip !== undefined && {
          ip: datosDispositivo.ip,
        }),
      },
    });

    // 8. Registrar el evento de seguridad.
    await tx.eventoSeguridad.create({
      data: {
        usuarioId: solicitud.usuarioId,
        tipo: "DISPOSITIVO_VINCULADO",
        descripcion: "Segundo dispositivo vinculado a la sesión compartida",

        ...(datosDispositivo.ip !== undefined && {
          ip: datosDispositivo.ip,
        }),

        ...(datosDispositivo.dispositivo !== undefined && {
          dispositivo: datosDispositivo.dispositivo,
        }),
      },
    });

    return {
      venceEn: sesion.venceEn,
      sesionId: sesion.id,
    };
  });

  return {
    token,
    expiresAt: resultado.venceEn,
    sesionId: resultado.sesionId,
  };
}

// ------------------------------------------------------

// HEARTBEAT DEL DISPOSITIVO PRINCIPAL

// ------------------------------------------------------

export async function registrarHeartbeatPrincipal(
  usuarioId: string,

  sesionId: string,

  dispositivoId: string,
) {
  const ahora = new Date();

  await prisma.$transaction(async (tx) => {
    await bloquearSesion(tx, sesionId);

    const sesionActualizada = await tx.sesion.updateMany({
      where: {
        id: sesionId,

        usuarioId,

        estado: "ACTIVA",

        venceEn: {
          gt: ahora,
        },

        dispositivoPrincipalId: dispositivoId,
      },

      data: {
        ultimoHeartbeat: ahora,

        principalDesconectadoEn: null,
      },
    });

    if (sesionActualizada.count !== 1) {
      throw new Error("La sesión ya no está activa o no está autorizada");
    }

    const dispositivoActualizado = await tx.dispositivo.updateMany({
      where: {
        id: dispositivoId,

        usuarioId,

        sesionId,

        estado: "ACTIVO",

        esPrincipal: true,
      },

      data: {
        ultimoHeartbeat: ahora,
      },
    });

    if (dispositivoActualizado.count !== 1) {
      throw new Error("El dispositivo principal ya no está autorizado");
    }
  });

  return {
    registrado: true,

    fecha: ahora,
  };
}

// ------------------------------------------------------

// OBTENER USUARIO AUTENTICADO

// ------------------------------------------------------

export async function getCurrentUser(userId: string) {
  return prisma.usuario.findUnique({
    where: {
      id: userId,
    },

    select: {
      id: true,

      nombre: true,

      apellido: true,

      email: true,

      rol: true,

      estado: true,
    },
  });
}

export async function consultarEstadoSolicitudSegundoDispositivo(
  solicitudId: string,
  challengeToken: string,
) {
  if (!solicitudId || !challengeToken || challengeToken.length < 32) {
    throw new Error("Solicitud de acceso inválida");
  }

  const challengeTokenHash = calcularHashToken(challengeToken);

  return prisma.$transaction(async (tx) => {
    const ahora = new Date();

    const solicitud = await tx.solicitudAcceso.findFirst({
      where: {
        id: solicitudId,
        challengeTokenHash,
      },
      select: {
        id: true,
        usuarioId: true,
        estado: true,
        emailVerificadoEn: true,
        venceEn: true,
      },
    });

    if (!solicitud) {
      throw new Error("La solicitud no existe o no es válida");
    }

    // Comprobar si venció una solicitud todavía pendiente o aprobada.
    if (
      solicitud.venceEn <= ahora &&
      ["PENDIENTE", "APROBADA"].includes(solicitud.estado)
    ) {
      const actualizacion = await tx.solicitudAcceso.updateMany({
        where: {
          id: solicitud.id,
          challengeTokenHash,
          estado: solicitud.estado,
          venceEn: { lte: ahora },
        },
        data: {
          estado: "EXPIRADA",
          codigoAprobacionHash: null,
          codigoAprobacionCifrado: null,
        },
      });

      if (actualizacion.count === 1) {
        await tx.codigoVerificacion.updateMany({
          where: {
            solicitudAccesoId: solicitud.id,
            estado: { in: ["PENDIENTE", "BLOQUEADO"] },
          },
          data: {
            estado: "EXPIRADO",
          },
        });

        await tx.eventoSeguridad.create({
          data: {
            usuarioId: solicitud.usuarioId,
            tipo: "SOLICITUD_ACCESO_EXPIRADA",
            descripcion:
              "La solicitud de acceso de un segundo dispositivo venció sin completar la vinculación",
          },
        });

        return {
          estado: "EXPIRED" as const,
          mensaje: "La solicitud de acceso ha vencido",
        };
      }

      // Otra operación modificó la solicitud.
      // Consultamos nuevamente su estado real.
      const solicitudActualizada = await tx.solicitudAcceso.findFirst({
        where: {
          id: solicitud.id,
          challengeTokenHash,
        },
        select: {
          estado: true,
          emailVerificadoEn: true,
        },
      });

      if (!solicitudActualizada) {
        throw new Error("La solicitud ya no existe o no es válida");
      }

      return obtenerEstadoSolicitud(
        solicitudActualizada.estado,
        solicitudActualizada.emailVerificadoEn,
      );
    }

    return obtenerEstadoSolicitud(
      solicitud.estado,
      solicitud.emailVerificadoEn,
    );
  });
}

function obtenerEstadoSolicitud(
  estado: string,
  emailVerificadoEn: Date | null,
) {
  if (estado === "RECHAZADA") {
    return {
      estado: "REJECTED" as const,
      mensaje: "El dispositivo principal rechazó el acceso",
    };
  }

  if (estado === "CANCELADA") {
    return {
      estado: "CANCELLED" as const,
      mensaje: "La solicitud fue cancelada",
    };
  }

  if (estado === "EXPIRADA") {
    return {
      estado: "EXPIRED" as const,
      mensaje: "La solicitud de acceso ha vencido",
    };
  }

  if (estado === "COMPLETADA") {
    return {
      estado: "COMPLETED" as const,
      mensaje: "El dispositivo ya fue vinculado",
    };
  }

  if (!emailVerificadoEn) {
    return {
      estado: "PENDING_EMAIL" as const,
      mensaje: "Esperando la verificación del correo electrónico",
    };
  }

  if (estado === "PENDIENTE") {
    return {
      estado: "PENDING_APPROVAL" as const,
      mensaje: "Esperando la aprobación del dispositivo principal",
    };
  }

  if (estado === "APROBADA") {
    return {
      estado: "APPROVED" as const,
      mensaje: "Acceso aprobado. Ya podés completar la vinculación",
    };
  }

  throw new Error("Estado de solicitud no reconocido");
}
