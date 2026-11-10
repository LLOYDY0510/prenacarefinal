import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { canEmailRecipient } from './recipients';

let transporter: Transporter | null = null;

export function isEmailConfigured() {
  return Boolean(
    process.env.EMAIL_SMTP_USER &&
      process.env.EMAIL_SMTP_APP_PASSWORD &&
      process.env.EMAIL_FROM_EMAIL,
  );
}

function getTransporter() {
  if (!isEmailConfigured()) throw new Error('Email delivery is not configured.');
  if (transporter) return transporter;

  const port = Number(process.env.EMAIL_SMTP_PORT ?? '465');
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_SMTP_HOST ?? 'smtp.gmail.com',
    port,
    secure: port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: {
      user: process.env.EMAIL_SMTP_USER,
      pass: process.env.EMAIL_SMTP_APP_PASSWORD,
    },
  });
  return transporter;
}

export async function sendEmail(input: { to: string; subject: string; text: string }) {
  if (!canEmailRecipient(input.to)) throw new Error('This address is reserved for testing; no email was sent.');
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });
}
