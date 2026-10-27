import 'dotenv/config';

import * as emailRepository from '../src/services/email/email.repository';
import { processPendingEmails } from '../src/services/email/email.processor';

async function main() {
  const email = await emailRepository.create({
    destinatario: 'gonzalolarrica@gmail.com',
    asunto: 'Prueba del procesador - CCISJ',
    contenidoHtml: `
      <h2>Prueba del procesador</h2>
      <p>Este correo se registró primero en PostgreSQL.</p>
    `,
  });

  console.log('Correo pendiente creado:', email.id);

  const result = await processPendingEmails();

  console.log('Resultado:', result);
}

main().catch(console.error);