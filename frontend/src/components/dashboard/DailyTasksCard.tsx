import { habitDayHistory, type Habit, type HabitDayState } from '@planner/shared';
import { ArrowRight, Flame, Plus, Repeat } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../api/client';
import { useTaskEditor } from '../../context/TaskEditorContext';
import { useToast } from '../../context/ToastContext';
import { useHabits, useSetHabitCompletion } from '../../hooks/queries';
import { formatDate, pluralize } from '../../lib/format';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState, ErrorState, LoadingState, ProgressBar } from '../ui/Feedback';
import styles from './DailyTasks.module.css';

const HISTORY_DAYS = 30;

const DOT_LABEL: Record<HabitDayState, string> = {
  done: 'done',
  missed: 'missed',
  pending: 'not done yet',
  off: 'not scheduled',
  before: 'before this daily task existed',
};

/**
 * Daily tasks (habits scheduled today), at the top of the dashboard: tick them off for today,
 * see progress, streaks and the last 30 days at a glance. Ticks save only once the server confirms.
 */
export function DailyTasksCard({ today }: { today: string }) {
  const habits = useHabits();
  const editor = useTaskEditor();

  const action = (
    <Link to="/habits" className={styles.manageLink}>
      Manage <ArrowRight size={14} aria-hidden />
    </Link>
  );

  if (habits.isPending) {
    return (
      <Card title="Today's daily tasks">
        <LoadingState label="Loading daily tasks…" />
      </Card>
    );
  }
  if (habits.isError) {
    return (
      <Card title="Today's daily tasks">
        <ErrorState error={habits.error} onRetry={() => habits.refetch()} />
      </Card>
    );
  }

  const dueToday = habits.data.filter((h) => h.stats.scheduledToday);
  const doneCount = dueToday.filter((h) => h.stats.completedToday).length;

  if (dueToday.length === 0) {
    return (
      <Card title="Today's daily tasks" action={habits.data.length > 0 ? action : undefined}>
        <EmptyState
          compact
          icon={Repeat}
          title={habits.data.length > 0 ? 'No daily tasks today' : 'No daily tasks yet'}
          description={
            habits.data.length > 0
              ? 'None of your daily tasks are scheduled for today.'
              : 'Add a task that repeats every day and it will appear here automatically.'
          }
          action={
            <Button
              size="sm"
              icon={<Plus size={15} />}
              onClick={() => editor.openNew({ repeat: 'DAILY' })}
            >
              Add a daily task
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card title="Today's daily tasks" action={action}>
      <div className={styles.progress}>
        <span>
          <strong>
            {doneCount} of {dueToday.length}
          </strong>{' '}
          done today
        </span>
        <ProgressBar
          value={(doneCount / dueToday.length) * 100}
          label={`${doneCount} of ${dueToday.length} daily tasks done today`}
        />
      </div>
      <ul className={styles.list} aria-label="Today's daily tasks">
        {dueToday.map((habit) => (
          <DailyTaskRow key={habit.id} habit={habit} today={today} />
        ))}
      </ul>
    </Card>
  );
}

function DailyTaskRow({ habit, today }: { habit: Habit; today: string }) {
  const toast = useToast();
  const setCompletion = useSetHabitCompletion();
  const [pending, setPending] = useState(false);
  const done = habit.stats.completedToday;
  const history = habitDayHistory(
    {
      frequency: habit.frequency,
      daysOfWeek: habit.daysOfWeek,
      startDate: habit.startDate,
      completions: habit.completions,
      today,
    },
    HISTORY_DAYS,
  );

  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      await setCompletion.mutateAsync({ id: habit.id, date: today, done: !done });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      className={`${styles.row} ${done ? styles.rowDone : ''} ${pending ? styles.rowSaving : ''}`}
    >
      <input
        type="checkbox"
        className={styles.check}
        checked={done}
        onChange={toggle}
        disabled={pending}
        style={{ ['--habit-color' as string]: habit.color }}
        aria-label={
          done ? `Mark "${habit.name}" as not done today` : `Mark "${habit.name}" as done today`
        }
      />
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.name}>{habit.name}</span>
          <span className={styles.meta}>
            {habit.stats.currentStreak > 0 && (
              <span className={styles.streak} title="Current streak">
                <Flame size={13} aria-hidden /> {habit.stats.currentStreak}
              </span>
            )}
            <span>{pluralize(habit.stats.totalCompletions, 'time')} done</span>
          </span>
        </div>
        <ol className={styles.dots} aria-label={`Last ${HISTORY_DAYS} days for ${habit.name}`}>
          {history.map((day) => (
            <li
              key={day.date}
              className={`${styles.dot} ${styles[day.state]}`}
              style={{ ['--habit-color' as string]: habit.color }}
              title={`${formatDate(day.date, 'weekdayShort')}: ${DOT_LABEL[day.state]}`}
            >
              <span className="visually-hidden">
                {formatDate(day.date, 'weekdayShort')}: {DOT_LABEL[day.state]}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </li>
  );
}
