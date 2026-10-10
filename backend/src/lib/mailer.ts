import nodemailer from 'nodemailer';
import { config } from '../config.js';

const transport = config.smtpConfigured
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

export const mailEnabled = () => transport !== null;

/**
 * Sends an email if SMTP is configured. Never throws — failures are logged
 * (without message bodies) so a mail outage cannot break a booking or enquiry.
 * Returns whether the message was handed to the SMTP server.
 */
export async function sendMail(to: string, subject: string, textBody: string): Promise<boolean> {
  if (!transport) return false;
  try {
    await transport.sendMail({ from: config.SMTP_FROM, to, subject, text: textBody });
    return true;
  } catch (err) {
    console.error(`[mail] failed to send "${subject}":`, (err as Error).message);
    return false;
  }
}

export async function notifyAdminByEmail(subject: string, textBody: string) {
  if (config.ADMIN_NOTIFY_EMAIL) await sendMail(config.ADMIN_NOTIFY_EMAIL, subject, textBody);
}

export const appUrl = (path: string) => new URL(path, config.APP_ORIGIN).toString();
