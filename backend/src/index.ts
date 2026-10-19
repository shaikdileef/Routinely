import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { applyMigrations } from './migrate.js';
import { notificationAvailability } from './notifications/index.js';
import { startReminderScheduler } from './reminderScheduler.js';

async function main() {
  console.log(`Database ready (${applyMigrations()})`);
  await prisma.$connect();
  const server = createApp().listen(config.PORT, () => {
    console.log(`API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
  });
  const stopReminders = startReminderScheduler();
  const describe = { live: 'live', preview: 'preview (no keys yet)', off: 'not set up' } as const;
  const { email, whatsapp } = notificationAvailability();
  console.log(`Reminders: email ${describe[email]}, WhatsApp ${describe[whatsapp]}`);

  const shutdown = async () => {
    stopReminders();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (err) => {
  console.error('Failed to start server:', err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
