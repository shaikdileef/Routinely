import { deadlineUrgency, type Task, type TaskQueryInput } from '@planner/shared';
import { CalendarClock, Plus } from 'lucide-react';
import { TaskFilters, type FilterKey } from '../components/tasks/TaskFilters';
import { TaskGroup, TaskList } from '../components/tasks/TaskList';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback';
import { useTaskEditor } from '../context/TaskEditorContext';
import { useTasks } from '../hooks/queries';
import { useToday } from '../hooks/useToday';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { formatDate, relativeDay } from '../lib/format';
import styles from './Pages.module.css';

const FILTER_KEYS: FilterKey[] = ['priority', 'categoryId'];

function groupByDate(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    groups.set(t.dueDate, [...(groups.get(t.dueDate) ?? []), t]);
  }
  return [...groups.entries()];
}

export function UpcomingPage() {
  const { today } = useToday();
  const editor = useTaskEditor();
  const { values, update } = useUrlFilters(FILTER_KEYS);
  const base = values as Partial<TaskQueryInput>;

  const upcoming = useTasks({ ...base, view: 'upcoming', sort: 'dueDate', pageSize: 500 });
  const noDate = useTasks({ ...base, view: 'nodate', sort: 'priority', pageSize: 200 });

  return (
    <>
      <PageHeader
        title="Upcoming"
        subtitle="Open tasks due after today, in date order"
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => editor.openNew()}>
            New task
          </Button>
        }
      />
      <div className={styles.stack}>
        <TaskFilters values={values} onChange={update} show={FILTER_KEYS} />

        <Card>
          {upcoming.isPending ? (
            <LoadingState />
          ) : upcoming.isError ? (
            <ErrorState error={upcoming.error} onRetry={() => upcoming.refetch()} />
          ) : upcoming.data.data.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No upcoming deadlines"
              description="Tasks with a future due date will appear here, grouped by day."
            />
          ) : (
            groupByDate(upcoming.data.data).map(([date, tasks]) => {
              const urgency = deadlineUrgency({ dueDate: date, status: 'TODO' }, today);
              return (
                <TaskGroup
                  key={date}
                  count={tasks.length}
                  title={
                    <>
                      {relativeDay(date, today)}
                      {urgency !== 'later' && (
                        <span
                          style={{
                            color: 'var(--warning)',
                            textTransform: 'none',
                            letterSpacing: 0,
                          }}
                        >
                          · due soon
                        </span>
                      )}
                      <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                        {formatDate(date, 'shortWithYear')}
                      </span>
                    </>
                  }
                >
                  <TaskList
                    tasks={tasks}
                    showDueDate={false}
                    label={`Due ${formatDate(date, 'long')}`}
                  />
                </TaskGroup>
              );
            })
          )}
        </Card>

        <Card title="No due date">
          {noDate.isPending ? (
            <LoadingState />
          ) : noDate.isError ? (
            <ErrorState error={noDate.error} onRetry={() => noDate.refetch()} />
          ) : (
            <TaskList
              tasks={noDate.data.data}
              label="Tasks without a due date"
              empty={
                <p className={`${styles.muted} ${styles.small}`}>Every open task has a due date.</p>
              }
            />
          )}
        </Card>
      </div>
    </>
  );
}
