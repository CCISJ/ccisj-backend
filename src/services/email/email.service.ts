import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  idempotencyKey?: string;
}

export const emailService = {
  async send({
    to,
    subject,
    html,
    idempotencyKey,
  }: SendEmailOptions) {
    const { data, error } = await resend.emails.send(
      {
        from: process.env.EMAIL_FROM!,
        to,
        subject,
        html,
      },
      idempotencyKey
        ? { idempotencyKey }
        : undefined,
    );

    if (error) {
      throw new Error(`Error enviando correo: ${error.message}`);
    }

    return data;
  },
};