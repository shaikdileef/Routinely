import type { Habit } from '@planner/shared';
import { Plus, Repeat } from 'lucide-react';
import { useState } from 'react';
import { HabitCard } from '../components/habits/HabitCard';
import { HabitFormModal } from '../components/habits/HabitFormModal';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { useSession } from '../context/AuthContext';
import { useHabits } from '../hooks/queries';
import { useToday } from '../hooks/useToday';
import styles from './Pages.module.css';

export function HabitsPage() {
  const { today } = useToday();
  const { weekStartsOn } = useSession().settings;
  const habits = useHabits();
  const [editing, setEditing] = useState<{ habit?: Habit } | null>(null);

  const list = habits.data ?? [];
  const dueToday = list.filter((h) => h.stats.scheduledToday);
  const doneToday = dueToday.filter((h) => h.stats.completedToday).length;

  return (
    <>
      <PageHeader
        title="Habits"
        subtitle={
          list.length > 0
            ? `${doneToday} of ${dueToday.length} scheduled habit${dueToday.length === 1 ? '' : 's'} done today`
            : 'Build routines one day at a time'
        }
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing({})}>
            New habit
          </Button>
        }
      />
      {habits.isPending ? (
        <LoadingState />
      ) : habits.isError ? (
        <ErrorState error={habits.error} onRetry={() => habits.refetch()} />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={Repeat}
            title="No habits yet"
            description="Track routines like reading, exercise, learning to code, drinking water or meditation. Streaks follow each habit's own schedule."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing({})}>
                Create a habit
              </Button>
            }
          />
        </Card>
      ) : (
        <div className={styles.cardGrid}>
          {list.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              today={today}
              weekStartsOn={weekStartsOn}
              onEdit={() => setEditing({ habit: h })}
            />
          ))}
        </div>
      )}
      {editing && <HabitFormModal habit={editing.habit} onClose={() => setEditing(null)} />}
    </>
  );
}
