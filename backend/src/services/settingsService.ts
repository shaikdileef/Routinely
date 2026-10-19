import type { UserSettings, settingsUpdateSchema } from '@planner/shared';
import type { z } from 'zod';
import { prisma } from '../db.js';
import { validationError } from '../lib/errors.js';
import { toSettingsDTO } from '../lib/serialize.js';
import { refreshUserReminders } from './reminderService.js';

type SettingsUpdate = z.output<typeof settingsUpdateSchema>;

/** Changes to any of these move or re-route the user's reminders. */
const REMINDER_FIELDS = [
  'timezone',
  'notifyEmail',
  'notifyPhone',
  'emailReminders',
  'whatsappReminders',
] as const satisfies readonly (keyof SettingsUpdate)[];

export async function updateSettings(userId: string, input: SettingsUpdate): Promise<UserSettings> {
  const current = await prisma.userSettings.findUnique({ where: { userId } });
  const phone =
    input.notifyPhone !== undefined ? input.notifyPhone : (current?.notifyPhone ?? null);
  const whatsapp = input.whatsappReminders ?? current?.whatsappReminders ?? false;
  if (whatsapp && !phone) {
    throw validationError([
      { path: 'notifyPhone', message: 'Add your WhatsApp number to turn on WhatsApp reminders' },
    ]);
  }

  const row = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
  if (REMINDER_FIELDS.some((field) => input[field] !== undefined)) {
    await refreshUserReminders(userId);
  }
  return toSettingsDTO(row);
}
