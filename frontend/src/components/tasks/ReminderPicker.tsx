import {
  DEFAULT_REMINDER_TIME,
  describeReminder,
  MAX_REMINDERS_PER_TASK,
  REMINDER_PRESETS,
  reminderKey,
  type ReminderSpec,
  type TaskReminder,
} from '@planner/shared';
import { Bell, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from '../../context/AuthContext';
import styles from './TaskExtras.module.css';

interface ReminderPickerProps {
  value: ReminderSpec[];
  onChange: (specs: ReminderSpec[]) => void;
  /** The task's due date (YYYY-MM-DD) as currently entered; relative reminders need one. */
  dueDate: string;
  /** Reminders already saved on the task, to show whether they were sent. */
  saved: TaskReminder[];
  error?: string;
  disabled?: boolean;
}

const STATUS_TEXT: Record<string, string> = {
  PENDING: 'Scheduled',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
  CANCELLED: 'Paused',
};

/** Choose when to be reminded about a task: presets relative to its due date, or a custom time. */
export function ReminderPicker({
  value,
  onChange,
  dueDate,
  saved,
  error,
  disabled,
}: ReminderPickerProps) {
  const labelId = useId();
  const { settings } = useSession();
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState(DEFAULT_REMINDER_TIME);
  const keys = new Set(value.map(reminderKey));
  const full = value.length >= MAX_REMINDERS_PER_TASK;
  const noChannel = !settings.emailReminders && !settings.whatsappReminders;

  const toggle = (spec: ReminderSpec) => {
    const key = reminderKey(spec);
    onChange(keys.has(key) ? value.filter((s) => reminderKey(s) !== key) : [...value, spec]);
  };

  function addCustom() {
    if (!customDate || !customTime) return;
    const spec: ReminderSpec = { type: 'custom', date: customDate, time: customTime };
    if (!keys.has(reminderKey(spec))) onChange([...value, spec]);
    setCustomDate('');
  }

  const statusOf = (spec: ReminderSpec) => {
    const deliveries = saved.find((r) => r.key === reminderKey(spec))?.deliveries ?? [];
    return deliveries.map(
      (d) => `${d.channel === 'EMAIL' ? 'Email' : 'WhatsApp'}: ${STATUS_TEXT[d.status]}`,
    );
  };

  return (
    <div className={styles.group} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.label}>
        <Bell size={14} aria-hidden /> Reminders <span className={styles.optional}>(optional)</span>
      </span>

      <div className={styles.chips}>
        {REMINDER_PRESETS.map(({ label, spec }) => (
          <button
            key={label}
            type="button"
            className={styles.chip}
            aria-pressed={keys.has(reminderKey(spec))}
            onClick={() => toggle(spec)}
            disabled={disabled || !dueDate || (full && !keys.has(reminderKey(spec)))}
            title={dueDate ? `${label} at ${spec.time}` : 'Add a due date first'}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.customRow}>
        <input
          type="date"
          className={styles.miniInput}
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          aria-label="Custom reminder date"
          disabled={disabled || full}
        />
        <input
          type="time"
          className={styles.miniInput}
          value={customTime}
          onChange={(e) => setCustomTime(e.target.value)}
          aria-label="Custom reminder time"
          disabled={disabled || full}
        />
        <button
          type="button"
          className={styles.chip}
          onClick={addCustom}
          disabled={disabled || full || !customDate}
        >
          <Plus size={14} aria-hidden /> Add custom
        </button>
      </div>

      {value.length > 0 && (
        <ul className={styles.reminderList} aria-label="Chosen reminders">
          {value.map((spec) => {
            const status = statusOf(spec);
            return (
              <li key={reminderKey(spec)}>
                <span>
                  {describeReminder(spec)}
                  {status.length > 0 && <small>{status.join(' · ')}</small>}
                </span>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => toggle(spec)}
                  disabled={disabled}
                  aria-label={`Remove reminder: ${describeReminder(spec)}`}
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!dueDate && (
        <p className={styles.hint}>
          Add a due date to use reminders before it, or pick a custom time.
        </p>
      )}
      {noChannel && value.length > 0 && (
        <p className={styles.hint}>
          Reminders are off for every channel. Turn on email or WhatsApp in{' '}
          <Link to="/settings">Settings</Link>.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
