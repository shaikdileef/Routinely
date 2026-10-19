import {
  PRIORITIES,
  PRIORITY_LABELS,
  PRIORITY_RANK,
  timeToMinutes,
  type Task,
} from '@planner/shared';
import { CalendarCheck, PartyPopper } from 'lucide-react';
import { useState } from 'react';
import { QuickAdd } from '../components/tasks/QuickAdd';
import { TaskGroup, TaskList } from '../components/tasks/TaskList';
import { Card, PageHeader } from '../components/ui/Card';
import { EmptyState, ErrorState, LoadingState, ProgressBar } from '../components/ui/Feedback';
import { useTasks } from '../hooks/queries';
import { useToday } from '../hooks/useToday';
import { formatDate, pluralize } from '../lib/format';
import styles from './Pages.module.css';

type Grouping = 'time' | 'priority';

const TIME_GROUPS = [
  { key: 'morning', label: 'Morning', test: (m: number) => m < 12 * 60 },
  { key: 'afternoon', label: 'Afternoon', test: (m: number) => m >= 12 * 60 && m < 17 * 60 },
  { key: 'evening', label: 'Evening', test: (m: number) => m >= 17 * 60 },
];

function groupTasks(
  tasks: Task[],
  grouping: Grouping,
): { key: string; label: string; tasks: Task[] }[] {
  if (grouping === 'priority') {
    return [...PRIORITIES].reverse().map((p) => ({
      key: p,
      label: PRIORITY_LABELS[p],
      tasks: tasks.filter((t) => t.priority === p),
    }));
  }
  const byTime = (a: Task, b: Task) => (a.startTime ?? '').localeCompare(b.startTime ?? '');
  const timed = TIME_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    tasks: tasks.filter((t) => t.startTime && g.test(timeToMinutes(t.startTime))).sort(byTime),
  }));
  const anytime = tasks
    .filter((t) => !t.startTime)
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  return [...timed, { key: 'anytime', label: 'Anytime', tasks: anytime }];
}

export function TodayPage() {
  const { today } = useToday();
  const [grouping, setGrouping] = useState<Grouping>('time');
  const todayTasks = useTasks({ view: 'today', sort: 'dueDate', pageSize: 500 });
  const overdue = useTasks({ view: 'overdue', sort: 'dueDate', pageSize: 100 });

  const all = todayTasks.data?.data ?? [];
  const open = all.filter((t) => t.status !== 'COMPLETED');
  const done = all.filter((t) => t.status === 'COMPLETED');
  const pct = all.length === 0 ? 0 : Math.round((done.length / all.length) * 100);
  const overdueTasks = overdue.data?.data ?? [];

  return (
    <>
      <PageHeader title="Today" subtitle={formatDate(today, 'long')} />
      <div className={styles.stack}>
        <Card>
          <div className={styles.toolbar} style={{ marginBottom: 10 }}>
            <strong>
              {all.length === 0
                ? 'No tasks due today'
                : `${done.length} of ${pluralize(all.length, 'task')} done`}
            </strong>
            <span className={styles.muted}>{pct}%</span>
          </div>
          <ProgressBar value={pct} label="Today's progress" />
          <div style={{ marginTop: 16 }}>
            <QuickAdd dueDate={today} placeholder="Add a task for today…" />
          </div>
        </Card>

        {overdueTasks.length > 0 && (
          <Card>
            <TaskGroup title="Overdue" count={overdue.data?.meta.total} tone="danger">
              <TaskList tasks={overdueTasks} label="Overdue tasks" />
            </TaskGroup>
          </Card>
        )}

        <Card
          title="Scheduled for today"
          action={
            <div className={styles.segmented} role="group" aria-label="Group tasks by">
              <button
                type="button"
                aria-pressed={grouping === 'time'}
                onClick={() => setGrouping('time')}
              >
                Time
              </button>
              <button
                type="button"
                aria-pressed={grouping === 'priority'}
                onClick={() => setGrouping('priority')}
              >
                Priority
              </button>
            </div>
          }
        >
          {todayTasks.isPending ? (
            <LoadingState />
          ) : todayTasks.isError ? (
            <ErrorState error={todayTasks.error} onRetry={() => todayTasks.refetch()} />
          ) : all.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="A clear day"
              description="Nothing is due today. Add a task above, or plan ahead in Upcoming."
            />
          ) : (
            <>
              {open.length === 0 ? (
                <EmptyState
                  compact
                  icon={PartyPopper}
                  title="All done for today!"
                  description="Every task due today is complete. Nice work."
                />
              ) : (
                groupTasks(open, grouping)
                  .filter((g) => g.tasks.length > 0)
                  .map((g) => (
                    <TaskGroup key={g.key} title={g.label} count={g.tasks.length}>
                      <TaskList tasks={g.tasks} showDueDate={false} label={`${g.label} tasks`} />
                    </TaskGroup>
                  ))
              )}
              {done.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <TaskGroup title="Completed" count={done.length}>
                    <TaskList tasks={done} showDueDate={false} label="Completed today" />
                  </TaskGroup>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
