import type { SystemCheck } from '@planner/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import {
  emailTransport,
  isEmailConfigured,
  isWhatsAppConfigured,
  notificationAvailability,
} from '../notifications/index.js';
import { schedulerState } from '../reminderScheduler.js';
import { isSpotifyConfigured } from '../spotify/client.js';

const TIMEOUT_MS = 8000;

/** Rejects if `promise` takes longer than the timeout, so one slow service can't hang the page. */
function withTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not answer within 8 seconds`)), TIMEOUT_MS),
    ),
  ]);
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Calls to the outside services, kept in one object so tests can replace them.
 * Each resolves when the credentials are accepted and rejects with the reason otherwise.
 */
export const systemProbes = {
  async email() {
    await withTimeout(emailTransport().verify(), 'Gmail');
  },
  async whatsapp() {
    const sid = config.TWILIO_ACCOUNT_SID!;
    const auth = Buffer.from(`${sid}:${config.TWILIO_AUTH_TOKEN}`).toString('base64');
    const res = await withTimeout(
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${auth}` },
      }),
      'Twilio',
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? `Twilio answered HTTP ${res.status}`);
    }
  },
  async spotify() {
    const basic = Buffer.from(
      `${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`,
    ).toString('base64');
    const res = await withTimeout(
      fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
      }),
      'Spotify',
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error_description?: string } | null;
      throw new Error(body?.error_description ?? `Spotify answered HTTP ${res.status}`);
    }
  },
};

async function checkDatabase(): Promise<SystemCheck> {
  const base = { key: 'database', label: 'Database' } as const;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ...base, status: 'ok', detail: 'PostgreSQL is connected', fix: null };
  } catch (err) {
    return {
      ...base,
      status: 'error',
      detail: errorText(err),
      fix: 'Check that PostgreSQL is running and DATABASE_URL in backend/.env is correct.',
    };
  }
}

function checkScheduler(now: Date): SystemCheck {
  const base = { key: 'scheduler', label: 'Reminder scheduler' } as const;
  const { running, lastRunAt, lastResult, lastError } = schedulerState;
  if (!running) {
    return {
      ...base,
      status: 'error',
      detail: 'Not running, so reminders will not be sent',
      fix: 'Start the backend with npm run start:dev; reminders only go out while it runs.',
    };
  }
  if (lastError) {
    return { ...base, status: 'error', detail: `Last check failed: ${lastError}`, fix: null };
  }
  const ago = lastRunAt ? Math.round((now.getTime() - lastRunAt.getTime()) / 1000) : null;
  const last = lastResult
    ? ` (last run: ${lastResult.sent} sent, ${lastResult.failed} failed)`
    : '';
  return {
    ...base,
    status: 'ok',
    detail: `Checks for due reminders every minute; last checked ${ago === null ? 'just now' : `${ago}s ago`}${last}`,
    fix: null,
  };
}

async function checkExternal(
  key: 'email' | 'whatsapp' | 'spotify',
  label: string,
  configured: boolean,
  okDetail: string,
  missing: { detail: string; fix: string },
  badFix: string,
): Promise<SystemCheck> {
  const base = { key, label };
  if (!configured) return { ...base, status: 'missing', ...missing };
  try {
    await systemProbes[key]();
    return { ...base, status: 'ok', detail: okDetail, fix: null };
  } catch (err) {
    return { ...base, status: 'error', detail: errorText(err), fix: badFix };
  }
}

/** Runs every check in parallel. */
export async function runSystemChecks(now = new Date()): Promise<SystemCheck[]> {
  const modes = notificationAvailability();
  const previewNote = (mode: string) =>
    mode === 'preview'
      ? 'Not set up yet; reminders are recorded in Recent deliveries instead of being sent.'
      : 'Not set up; reminders on this channel will fail.';

  return Promise.all([
    checkDatabase(),
    Promise.resolve(checkScheduler(now)),
    checkExternal(
      'email',
      'Email (Gmail SMTP)',
      isEmailConfigured(),
      `Signed in to ${config.SMTP_HOST} as ${config.SMTP_USER}; emails are sent for real`,
      {
        detail: previewNote(modes.email),
        fix: 'Set SMTP_USER and SMTP_PASS (a Gmail app password) in backend/.env, then restart the backend.',
      },
      'Gmail refused the login. SMTP_PASS must be a 16-character app password (Google Account → Security → App passwords), not your normal password.',
    ),
    checkExternal(
      'whatsapp',
      'WhatsApp (Twilio)',
      isWhatsAppConfigured(),
      `Twilio account accepted; messages are sent from ${config.TWILIO_WHATSAPP_FROM}`,
      {
        detail: previewNote(modes.whatsapp),
        fix: 'Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in backend/.env, then restart the backend.',
      },
      'Twilio refused the credentials. Copy the Account SID and Auth Token again from console.twilio.com.',
    ),
    checkExternal(
      'spotify',
      'Spotify',
      isSpotifyConfigured(),
      `App credentials accepted. Redirect URI on the Spotify app must be exactly ${config.SPOTIFY_REDIRECT_URI}`,
      {
        detail: 'Not set up; the Spotify card cannot connect.',
        fix: `Create an app at developer.spotify.com, add the redirect URI ${config.SPOTIFY_REDIRECT_URI}, and set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in backend/.env.`,
      },
      'Spotify refused the app credentials. Copy the Client ID and Client secret again from the app’s settings.',
    ),
  ]);
}
