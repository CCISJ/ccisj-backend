import 'dotenv/config';

import { processPendingEmails } from '../services/email/email.processor';
import * as emailRepository from '../services/email/email.repository';

const INTERVALO_MS = 30_000;

async function main() {
  if (process.env.EMAIL_WORKER_ENABLED !== 'true') {
    console.log('Worker de emails desactivado');
    return;
  }

  console.log('Worker de emails iniciado');

  while (true) {
    try {
      const paraRevision = await emailRepository.markStuckEmailsForReview();

      if (paraRevision.count > 0) {
        console.warn(`Correos para revisión manual: ${paraRevision.count}`);
      }

      const recuperados = await emailRepository.recoverStuckEmails();

      if (recuperados.count > 0) {
        console.log(`Correos recuperados: ${recuperados.count}`);
      }

      const resultado = await processPendingEmails(20);

      if (resultado.procesados > 0) {
        console.log('Emails procesados:', resultado);
      }
    } catch (error) {
      console.error('Error en el worker:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, INTERVALO_MS));
  }
}

main().catch(console.error);
