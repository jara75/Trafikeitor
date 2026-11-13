import nodemailer from 'nodemailer';

interface InvitationEmailPayload {
  id: string;
  email: string;
  inviterName?: string;
  organizationName?: string;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Envía el correo de invitación de equipo mediante SMTP (Hostinger / Nodemailer).
 * En entornos de prueba (IS_TEST) o sin credenciales SMTP, registra la invitación en consola.
 */
export async function sendTeamInvitationEmail(payload: InvitationEmailPayload) {
  const appUrl = (process.env.APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const inviteUrl = `${appUrl}/?invite=${encodeURIComponent(payload.id)}`;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (process.env.IS_TEST || !host || !user || !pass) {
    console.log('[Better Auth] Invitación enviada:', payload.email, 'id:', payload.id, 'url:', inviteUrl);
    return { sent: false, reason: process.env.IS_TEST ? 'test_mode' : 'missing_smtp_config' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const orgName = payload.organizationName || 'El Marcante // Estudio';
  const inviter = payload.inviterName || 'El Director del Estudio';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f3f4f6;color:#111827;padding:32px 20px;">
      <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border:1px solid #d1d5db;border-radius:14px;padding:28px;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0f766e;font-weight:700;margin-bottom:8px;">
          Trafikeitor // Invitación de Equipo
        </div>
        <h1 style="font-size:20px;margin:0 0 12px;color:#111827;">
          Te invitaron a unirte a ${escapeHtml(orgName)}
        </h1>
        <p style="font-size:14px;line-height:1.55;color:#374151;margin:0 0 22px;">
          <strong style="color:#111827;">${escapeHtml(inviter)}</strong> te envió una invitación para colaborar en la Mesa de Tráfico y el Stripboard del estudio.
        </p>
        <div style="margin:24px 0;">
          <a href="${inviteUrl}" style="display:inline-block;background-color:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">
            Aceptar Invitación
          </a>
        </div>
        <p style="font-size:12px;line-height:1.5;color:#4b5563;margin:0;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          <a href="${inviteUrl}" style="color:#0f766e;font-weight:600;word-break:break-all;">${inviteUrl}</a>
        </p>
      </div>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from,
      to: payload.email,
      subject: `Invitación a ${orgName} — Trafikeitor`,
      text: `${inviter} te invitó a unirte a ${orgName} en Trafikeitor. Acepta aquí: ${inviteUrl}`,
      html,
    });
    console.log('[SMTP] Correo de invitación enviado a:', payload.email, 'messageId:', info.messageId);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[SMTP] Error enviando invitación a', payload.email, err);
    throw err;
  }
}

