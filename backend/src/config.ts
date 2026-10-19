import 'dotenv/config';
import { z } from 'zod';

/** Optional setting: unset or empty means "not configured". */
const optional = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see backend/.env.example)'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters (see backend/.env.example)'),
  /** Optional path to the built frontend (frontend/dist); when set, the API also serves the SPA. */
  FRONTEND_DIST: z.string().optional(),
  /** Linked from reminder messages. */
  APP_URL: z.string().default('http://localhost:5173'),

  /**
   * In development, channels without keys record messages in the delivery log instead of
   * failing, so reminders can be tried end to end. Never used in production.
   */
  NOTIFY_PREVIEW: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /* Reminder email (SMTP via Nodemailer, e.g. Gmail with an app password). */
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  MAIL_FROM: optional,

  /* Reminder WhatsApp messages (Twilio). */
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  /** Twilio's WhatsApp sender, e.g. +14155238886 for the sandbox. */
  TWILIO_WHATSAPP_FROM: optional,

  /* Spotify listening stats (an app from developer.spotify.com). */
  SPOTIFY_CLIENT_ID: optional,
  SPOTIFY_CLIENT_SECRET: optional,
  /** Must match a Redirect URI on the Spotify app exactly (Spotify requires 127.0.0.1, not localhost). */
  SPOTIFY_REDIRECT_URI: z.string().default('http://127.0.0.1:4000/api/spotify/callback'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid server configuration:\n${problems}`);
}

export const config = parsed.data;
export const isProduction = config.NODE_ENV === 'production';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
