import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM ?? "";

if (!apiKey) {
  throw new Error("Falta configurar RESEND_API_KEY en el entorno");
}

if (!emailFrom) {
  throw new Error("Falta configurar EMAIL_FROM en el entorno");
}

const resend = new Resend(apiKey);

export async function enviarCodigoVerificacion(
  destinatario: string,
  codigo: string,
): Promise<void> {
  if (!/^\d{6}$/.test(codigo)) {
    throw new Error("El código de verificación no tiene un formato válido");
  }

  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to: destinatario,
    subject: "Código de verificación - CDP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; color: #333;">
        <h2>Centro de Descenso de Peso</h2>
        <p>Recibimos una solicitud para autorizar el acceso a tu cuenta.</p>
        <p>Tu código de verificación es:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px; background-color: #f3f3f3; text-align: center; border-radius: 8px;">
          ${codigo}
        </div>
        <p>Este código vence en 5 minutos, es de un solo uso y no debes compartirlo.</p>
        <p>Si no solicitaste este acceso, ignorá este correo.</p>
        <hr />
        <small>Centro de Descenso de Peso - CDP</small>
      </div>
    `,
  });

  if (error) {
    const mensaje = error.message.replaceAll(destinatario, "[CORREO OCULTO]");

    console.error("Error de Resend:", {
      nombre: error.name,
      estado: error.statusCode,
      mensaje,
    });

    throw new Error("No se pudo enviar el correo de verificación");
  }

  if (!data?.id) {
    console.error("Resend no devolvió un identificador de envío.");
    throw new Error("Resend no confirmó el envío del correo");
  }
}
