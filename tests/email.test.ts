import 'dotenv/config';
import { emailService } from '../src/services/email/email.service';

async function main() {
  const result = await emailService.send({
    to: 'TU_CORREO@gmail.com',
    subject: 'Prueba de correo - CCISJ',
    html: `
      <h2>¡Hola desde CCISJ!</h2>
      <p>El servicio de correos funciona correctamente.</p>
      <p>Este es un mensaje de prueba enviado con Resend.</p>
    `,
  });

  console.log('Correo enviado:', result);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});