import * as emailRepository from './email.repository';
import { emailService } from './email.service';

export async function processPendingEmails(limit = 50) {
  const pendingEmails = await emailRepository.findPending(limit);

  const testRecipient = process.env.EMAIL_TEST_RECIPIENT;

  const emailsToProcess = testRecipient
    ? pendingEmails.filter(
        (email) =>
          email.destinatario.toLowerCase() === testRecipient.toLowerCase(),
      )
    : pendingEmails;

  // En modo de prueba, los que no son para la dirección de prueba no se
  // mandan nunca. Si quedaran pendientes, el primer worker que arrancara sin
  // EMAIL_TEST_RECIPIENT (otro integrante o producción sobre la misma base)
  // los mandaría todos juntos a destinatarios reales.
  const omitidos = testRecipient
    ? await emailRepository.markAsSkipped(
        pendingEmails
          .filter((email) => !emailsToProcess.includes(email))
          .map((email) => email.id),
      )
    : 0;

  let enviados = 0;
  let fallidos = 0;

  for (const email of emailsToProcess) {
    const claimed = await emailRepository.claim(email.id);

    // Otro proceso ya tomó este correo.
    if (!claimed) continue;

    try {
      const result = await emailService.send({
        to: email.destinatario,
        subject: email.asunto,
        html: email.contenidoHtml,
        idempotencyKey: `ccisj-email-${email.id}`,
      });

      await emailRepository.markAsSent(email.id, result?.id ?? null);

      enviados++;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconocido al enviar correo';

      await emailRepository.markAsFailed(email.id, message, email.intentos + 1);

      fallidos++;

      console.error(`Error enviando correo ${email.id}:`, message);
    }
  }

  return {
    procesados: enviados + fallidos,
    enviados,
    fallidos,
    omitidos,
  };
}
