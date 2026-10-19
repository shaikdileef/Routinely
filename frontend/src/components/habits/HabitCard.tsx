import { addDays, isScheduledOn, startOfWeek, type DateKey, type Habit } from '@planner/shared';
import { Check, Flame, Pencil, Trash2, Trophy } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useDeleteHabit, useSetHabitCompletion } from '../../hooks/queries';
import { formatDate, pluralize } from '../../lib/format';
import { IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ProgressBar } from '../ui/Feedback';
import { frequencyLabel } from './HabitFormModal';
import styles from './Habits.module.css';

const HISTORY_WEEKS = 12;

interface HabitCardProps {
  habit: Habit;
  today: DateKey;
  weekStartsOn: number;
  onEdit: () => void;
}

export function HabitCard({ habit, today, weekStartsOn, onEdit }: HabitCardProps) {
  const toast = useToast();
  const setCompletion = useSetHabitCompletion();
  const deleteHabit = useDeleteHabit();
  const [confirming, setConfirming] = useState(false);
  const done = new Set(habit.completions);
  const { stats } = habit;

  const pendingDate =
    setCompletion.isPending && setCompletion.variables?.id === habit.id
      ? setCompletion.variables.date
      : null;

  async function toggle(date: DateKey) {
    if (setCompletion.isPending) return;
    try {
      await setCompletion.mutateAsync({ id: habit.id, date, done: !done.has(date) });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove() {
    try {
      await deleteHabit.mutateAsync(habit.id);
      toast.success('Habit deleted');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const historyStart = addDays(startOfWeek(today, weekStartsOn), -7 * (HISTORY_WEEKS - 1));
  const weeks = Array.from({ length: HISTORY_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(historyStart, w * 7 + d)),
  );

  const dayButton = (date: DateKey, variant: 'strip' | 'cell') => {
    const scheduled = isScheduledOn(habit, date);
    const future = date > today;
    const isDone = done.has(date);
    const label = `${habit.name}, ${formatDate(date, 'long')}: ${
      future ? 'upcoming' : !scheduled ? 'not scheduled' : isDone ? 'done' : 'not done'
    }`;
    return (
      <button
        key={date}
        type="button"
        className={[
          variant === 'strip' ? styles.stripDay : styles.cell,
          isDone && styles.isDone,
          !scheduled && styles.off,
          date === today && styles.isToday,
          pendingDate === date && styles.pending,
        ]
          .filter(Boolean)
          .join(' ')}
        style={isDone ? { background: habit.color, borderColor: habit.color } : undefined}
        disabled={!scheduled || future || setCompletion.isPending}
        aria-pressed={scheduled && !future ? isDone : undefined}
        aria-label={label}
        title={variant === 'cell' ? label : undefined}
        onClick={() => toggle(date)}
      >
        {variant === 'strip' && (
          <>
            <span className={styles.stripWeekday}>
              {formatDate(date, 'weekdayNarrow').slice(0, 2)}
            </span>
            <span className={styles.stripMark}>
              {isDone ? <Check size={14} aria-hidden /> : formatDate(date, 'dayNumber')}
            </span>
          </>
        )}
      </button>
    );
  };

  return (
    <article className={styles.card} aria-labelledby={`habit-${habit.id}`}>
      <header className={styles.cardHeader}>
        <span className={styles.colorDot} style={{ background: habit.color }} aria-hidden />
        <div className={styles.cardTitleWrap}>
          <h3 id={`habit-${habit.id}`} className={styles.cardTitle}>
            {habit.name}
          </h3>
          <p className={styles.cardMeta}>
            {frequencyLabel(habit)}
            {habit.description && ` · ${habit.description}`}
          </p>
        </div>
        <IconButton label={`Edit ${habit.name}`} onClick={onEdit}>
          <Pencil size={16} />
        </IconButton>
        <IconButton
          label={`Delete ${habit.name}`}
          variant="danger"
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={16} />
        </IconButton>
      </header>

      <div className={styles.streaks}>
        <div>
          <Flame size={16} aria-hidden className={styles.flame} />
          <strong>{stats.currentStreak}</strong>
          <span>current streak</span>
        </div>
        <div>
          <Trophy size={16} aria-hidden className={styles.trophy} />
          <strong>{stats.longestStreak}</strong>
          <span>best streak</span>
        </div>
      </div>

      <div className={styles.strip} role="group" aria-label="Last 7 days">
        {last7.map((d) => dayButton(d, 'strip'))}
      </div>

      <div className={styles.progressRows}>
        <ProgressLine
          label="This week"
          completed={stats.week.completed}
          scheduled={stats.week.scheduled}
        />
        <ProgressLine
          label="This month"
          completed={stats.month.completed}
          scheduled={stats.month.scheduled}
        />
      </div>

      <details className={styles.history}>
        <summary>History · {pluralize(stats.totalCompletions, 'completion')}</summary>
        <div className={styles.heatmap} role="group" aria-label={`Last ${HISTORY_WEEKS} weeks`}>
          {weeks.map((week) => (
            <div key={week[0]} className={styles.heatCol}>
              {week.map((d) => dayButton(d, 'cell'))}
            </div>
          ))}
        </div>
      </details>

      <ConfirmDialog
        open={confirming}
        title="Delete habit?"
        message={
          <>
            <strong>{habit.name}</strong> and its entire completion history (
            {pluralize(stats.totalCompletions, 'entry', 'entries')}) will be permanently deleted.
          </>
        }
        confirmLabel="Delete habit"
        busy={deleteHabit.isPending}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </article>
  );
}

function ProgressLine({
  label,
  completed,
  scheduled,
}: {
  label: string;
  completed: number;
  scheduled: number;
}) {
  const pct = scheduled === 0 ? 0 : (completed / scheduled) * 100;
  return (
    <div className={styles.progressLine}>
      <div className={styles.progressText}>
        <span>{label}</span>
        <span>
          {completed}/{scheduled}
        </span>
      </div>
      <ProgressBar
        value={pct}
        label={`${label}: ${completed} of ${scheduled} scheduled days done`}
      />
    </div>
  );
}
