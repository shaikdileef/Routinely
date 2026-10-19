import { useId } from 'react';
import styles from './TaskExtras.module.css';

export type Repeat = 'NEVER' | 'DAILY' | 'SPECIFIC_DAYS';

const OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'NEVER', label: 'Never' },
  { value: 'DAILY', label: 'Every day' },
  { value: 'SPECIFIC_DAYS', label: 'Specific days' },
];

// Displayed Monday first; values are JS weekday numbers (0 = Sunday).
const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

interface RepeatPickerProps {
  repeat: Repeat;
  days: number[];
  onChange: (repeat: Repeat, days: number[]) => void;
  error?: string;
  disabled?: boolean;
}

/** "Repeats" choice for a new task: once, every day, or on chosen weekdays. */
export function RepeatPicker({ repeat, days, onChange, error, disabled }: RepeatPickerProps) {
  const labelId = useId();
  const toggleDay = (day: number) =>
    onChange(repeat, days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);

  return (
    <div className={styles.group} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.label}>
        Repeats
      </span>
      <div className={styles.segmented}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={repeat === o.value}
            onClick={() => onChange(o.value, days)}
            disabled={disabled}
          >
            {o.label}
          </button>
        ))}
      </div>
      {repeat === 'SPECIFIC_DAYS' && (
        <div className={styles.chips} role="group" aria-label="Days of the week">
          {WEEKDAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={styles.chip}
              aria-pressed={days.includes(d.value)}
              onClick={() => toggleDay(d.value)}
              disabled={disabled}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      {repeat !== 'NEVER' && (
        <p className={styles.hint}>
          It will be added to your daily tasks and appear on the dashboard every
          {repeat === 'DAILY' ? ' day' : ' chosen day'}. Tick it off each day; it comes back fresh
          the next.
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
