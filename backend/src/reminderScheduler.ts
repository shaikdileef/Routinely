import {
  processDueReminders,
  pruneDeliveryLog,
  type ProcessResult,
} from './services/reminderService.js';

/** What the scheduler last did, for the System check in Settings. */
export const schedulerState: {
  running: boolean;
  startedAt: Date | null;
  lastRunAt: Date | null;
  lastResult: ProcessResult | null;
  lastError: string | null;
} = { running: false, startedAt: null, lastRunAt: null, lastResult: null, lastError: null };

/**
 * Checks for due reminders on start-up (catching any missed while the server was off) and
 * then every minute. Runs never overlap; sending itself is safe across restarts because
 * each reminder is claimed in the database first. Returns a function that stops it.
 */
export function startReminderScheduler(intervalMs = 60_000): () => void {
  let busy = false;
  schedulerState.running = true;
  schedulerState.startedAt = new Date();

  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const result = await processDueReminders();
      await pruneDeliveryLog();
      schedulerState.lastResult = result;
      schedulerState.lastError = null;
      const { sent, failed, cancelled } = result;
      if (sent + failed + cancelled > 0) {
        console.log(`Reminders: ${sent} sent, ${failed} failed, ${cancelled} cancelled`);
      }
    } catch (err) {
      schedulerState.lastError = err instanceof Error ? err.message : String(err);
      console.error('Reminder check failed:', schedulerState.lastError);
    } finally {
      schedulerState.lastRunAt = new Date();
      busy = false;
    }
  };

  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => {
    clearInterval(timer);
    schedulerState.running = false;
  };
}
