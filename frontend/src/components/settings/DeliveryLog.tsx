import type { DeliveryLogEntry } from '@planner/shared';
import { Mail, MessageCircle } from 'lucide-react';
import { useDeliveryLog } from '../../hooks/queries';
import styles from './DeliveryLog.module.css';

const timeFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

function statusOf(entry: DeliveryLogEntry) {
  if (!entry.ok) return { label: 'Failed', className: styles.failed };
  if (entry.mode === 'PREVIEW') return { label: 'Preview', className: styles.preview };
  return { label: 'Sent', className: styles.sent };
}

/**
 * The last messages the server sent (or, in preview mode, would have sent), so reminders
 * can be checked without waiting at the inbox. Click a row to read the message.
 */
export function DeliveryLog() {
  const log = useDeliveryLog();
  const entries = log.data ?? [];

  return (
    <section className={styles.log} aria-labelledby="delivery-log-title">
      <h3 id="delivery-log-title" className={styles.title}>
        Recent deliveries
      </h3>
      {log.isPending ? (
        <p className={styles.empty}>Loading…</p>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>
          Nothing yet. Reminders appear here the moment they go out; try "Send test".
        </p>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry) => {
            const status = statusOf(entry);
            const Icon = entry.channel === 'EMAIL' ? Mail : MessageCircle;
            return (
              <li key={entry.id}>
                <details className={styles.entry}>
                  <summary className={styles.summary}>
                    <Icon size={15} aria-label={entry.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} />
                    <span className={styles.subject}>{entry.subject}</span>
                    <span className={`${styles.badge} ${status.className}`}>{status.label}</span>
                    <time className={styles.time} dateTime={entry.createdAt}>
                      {timeFormat.format(new Date(entry.createdAt))}
                    </time>
                  </summary>
                  <div className={styles.body}>
                    <p className={styles.meta}>
                      To {entry.destination} ·{' '}
                      {entry.fromReminder ? 'Task reminder' : 'Test message'}
                    </p>
                    {entry.error && <p className={styles.error}>{entry.error}</p>}
                    <pre className={styles.text}>{entry.body}</pre>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
