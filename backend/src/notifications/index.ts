import type { ChannelMode, NotificationAvailability, ReminderChannel } from '@planner/shared';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { prisma } from '../db.js';

export interface Notification {
  subject: string;
  text: string;
}

/** Who a delivery is for, so it can be recorded in their delivery log. */
export interface DeliveryContext {
  userId: string;
  reminderId?: string;
}

/** Messages "sent" while running tests, for assertions. Nothing leaves the process. */
export const testOutbox: { channel: ReminderChannel; to: string; message: Notification }[] = [];

/** Thrown when a channel isn't set up on the server; the message is shown to the user. */
export class NotConfiguredError extends Error {}

export const isEmailConfigured = () =>
  Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);

export const isWhatsAppConfigured = () =>
  Boolean(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_WHATSAPP_FROM);

/** Live when configured; otherwise preview in development (unless NOTIFY_PREVIEW=false). */
function modeFor(configured: boolean): ChannelMode {
  if (configured) return 'live';
  return config.NODE_ENV !== 'production' && config.NOTIFY_PREVIEW ? 'preview' : 'off';
}

export function notificationAvailability(): NotificationAvailability {
  return {
    email: modeFor(isEmailConfigured()),
    whatsapp: modeFor(isWhatsAppConfigured()),
  };
}

let transporter: Transporter | null = null;

export function emailTransport(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  return transporter;
}

async function sendEmail(to: string, message: Notification) {
  await emailTransport().sendMail({
    from: config.MAIL_FROM ?? config.SMTP_USER,
    to,
    subject: message.subject,
    text: message.text,
  });
}

/** Sends through Twilio's REST API (no SDK needed). */
async function sendWhatsApp(to: string, message: Notification) {
  const sid = config.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: `whatsapp:${config.TWILIO_WHATSAPP_FROM}`,
      To: `whatsapp:${to}`,
      Body: `${message.subject}\n\n${message.text}`,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Twilio rejected the message: ${body?.message ?? `HTTP ${res.status}`}`);
  }
}

const CHANNEL_NAME: Record<ReminderChannel, string> = { EMAIL: 'Email', WHATSAPP: 'WhatsApp' };

/**
 * Delivers one message on one channel and records the attempt in the user's delivery log.
 * Returns the mode used; throws if it could not be delivered.
 */
export async function deliver(
  channel: ReminderChannel,
  to: string,
  message: Notification,
  ctx: DeliveryContext,
): Promise<ChannelMode> {
  const mode =
    config.NODE_ENV === 'test'
      ? 'preview'
      : notificationAvailability()[channel === 'EMAIL' ? 'email' : 'whatsapp'];
  const log = (ok: boolean, error: string | null) =>
    prisma.deliveryLog.create({
      data: {
        userId: ctx.userId,
        reminderId: ctx.reminderId ?? null,
        channel,
        destination: to.slice(0, 254),
        subject: message.subject.slice(0, 300),
        body: message.text,
        mode: mode === 'live' ? 'LIVE' : 'PREVIEW',
        ok,
        error: error?.slice(0, 500) ?? null,
      },
    });

  if (mode === 'off') {
    const error = `${CHANNEL_NAME[channel]} is not set up on the server (see backend/.env)`;
    await log(false, error);
    throw new NotConfiguredError(error);
  }
  if (config.NODE_ENV === 'test') testOutbox.push({ channel, to, message });

  try {
    if (mode === 'live') {
      if (channel === 'EMAIL') await sendEmail(to, message);
      else await sendWhatsApp(to, message);
    }
    await log(true, null);
    return mode;
  } catch (err) {
    await log(false, err instanceof Error ? err.message : 'Unknown error');
    throw err;
  }
}
