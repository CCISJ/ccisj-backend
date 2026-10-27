import 'dotenv/config';
import { emailService } from '../src/services/email/email.service';

async function main() {
  const idempotencyKey = `ccisj-test-${Date.now()}`;

  const email = {
    to: process.env.EMAIL_TEST_RECIPIENT!,
    subject: 'Prueba de idempotencia - CCISJ',
    html: '<p>Este correo debería enviarse una sola vez.</p>',
    idempotencyKey,
  };

  const primero = await emailService.send(email);
  const segundo = await emailService.send(email);

  console.log('Primer envío:', primero?.id);
  console.log('Segundo envío:', segundo?.id);

  console.log(
    'Mismo ID:',
    primero?.id === segundo?.id,
  );
}

main().catch(console.error);